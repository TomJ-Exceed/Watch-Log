// Data access shared by every screen. Each function takes a Supabase client, so the same
// code works in Next.js server components, client components, and a future Expo app.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Dealer, Occasion, Strap, Watch, WatchPhoto, WatchStats, WearLog } from "./database.types";

export type DB = SupabaseClient<Database>;
export const PHOTO_BUCKET = "watch-photos";

export type WatchCard = Watch & {
  photo_path: string | null;
  photo_url: string | null;
  stats: Pick<WatchStats, "wear_count" | "last_worn" | "wears_30" | "wears_90" | "wears_365">;
};

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Signed URLs for private photos, in one round trip. */
export async function signPhotos(db: DB, paths: string[], expiresIn = 60 * 60 * 6) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const { data } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(unique, expiresIn);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
}

/** Watches with primary photo + wear stats. */
export async function listWatchCards(db: DB, opts: { statuses?: Watch["status"][] } = {}): Promise<WatchCard[]> {
  let q = db.from("watches").select("*").order("brand").order("model");
  if (opts.statuses?.length) q = q.in("status", opts.statuses);
  const [watches, photos, stats] = await Promise.all([
    q.then(must<Watch[]>),
    db.from("watch_photos").select("watch_id, storage_path, is_primary, sort_order").order("is_primary", { ascending: false }).order("sort_order").then(must<Pick<WatchPhoto, "watch_id" | "storage_path" | "is_primary" | "sort_order">[]>),
    db.from("watch_stats").select("*").then(must<WatchStats[]>),
  ]);
  const firstPhoto = new Map<string, string>();
  for (const p of photos) if (!firstPhoto.has(p.watch_id)) firstPhoto.set(p.watch_id, p.storage_path);
  const urls = await signPhotos(db, [...firstPhoto.values()]);
  const statMap = new Map(stats.map((s) => [s.watch_id, s]));
  return watches.map((w) => {
    const path = firstPhoto.get(w.id) ?? null;
    const s = statMap.get(w.id);
    return {
      ...w,
      photo_path: path,
      photo_url: path ? urls.get(path) ?? null : null,
      stats: { wear_count: s?.wear_count ?? 0, last_worn: s?.last_worn ?? null, wears_30: s?.wears_30 ?? 0, wears_90: s?.wears_90 ?? 0, wears_365: s?.wears_365 ?? 0 },
    };
  });
}

export const listOccasions = (db: DB) =>
  db.from("occasions").select("*").order("sort_order").order("name").then(must<Occasion[]>);
export const listStraps = (db: DB) => db.from("straps").select("*").order("name").then(must<Strap[]>);
export const listDealers = (db: DB) => db.from("dealers").select("*").order("name").then(must<Dealer[]>);

export const listWearRange = (db: DB, from: string, to: string) =>
  db.from("wear_log").select("*").gte("date", from).lte("date", to).order("date").order("created_at").then(must<WearLog[]>);

export const listWearForWatch = (db: DB, watchId: string) =>
  db.from("wear_log").select("*").eq("watch_id", watchId).order("date", { ascending: false }).then(must<WearLog[]>);

export async function getWatch(db: DB, id: string) {
  const [watch, photos] = await Promise.all([
    db.from("watches").select("*").eq("id", id).maybeSingle().then(must<Watch | null>),
    db.from("watch_photos").select("*").eq("watch_id", id).order("is_primary", { ascending: false }).order("sort_order").then(must<WatchPhoto[]>),
  ]);
  if (!watch) return null;
  const urls = await signPhotos(db, photos.map((p) => p.storage_path));
  return { watch, photos: photos.map((p) => ({ ...p, url: urls.get(p.storage_path) ?? null })) };
}

/** Picker order: recently worn first, then favorites, then the rest. */
export function pickerOrder(cards: WatchCard[], today: string) {
  const recentCutoff = new Date(today);
  recentCutoff.setDate(recentCutoff.getDate() - 30);
  const cutoff = recentCutoff.toISOString().slice(0, 10);
  const score = (c: WatchCard) => {
    const recent = c.stats.last_worn && c.stats.last_worn >= cutoff;
    return (recent ? 2 : 0) + (c.is_favorite ? 1 : 0);
  };
  return [...cards].sort((a, b) => {
    const d = score(b) - score(a);
    if (d) return d;
    if (a.stats.last_worn !== b.stats.last_worn) return (b.stats.last_worn ?? "").localeCompare(a.stats.last_worn ?? "");
    return `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`);
  });
}

/** Owned watch not worn for the longest time (never-worn first). */
export function neglectedPick(cards: WatchCard[], today: string) {
  const owned = cards.filter((c) => c.status === "owned");
  if (owned.length < 2) return null;
  const sorted = [...owned].sort((a, b) => (a.stats.last_worn ?? "0000").localeCompare(b.stats.last_worn ?? "0000"));
  const pick = sorted[0];
  if (pick.stats.last_worn === today) return null;
  return pick;
}

export async function deleteSampleData(db: DB) {
  for (const table of ["wear_log", "watches", "straps", "dealers"] as const) {
    const { error } = await db.from(table).delete().like("notes", "[sample]%");
    if (error) throw new Error(error.message);
  }
}
