// Phase 2 analytics. Pure functions over plain rows — no Supabase or React — so the
// same code can run on the server, in the browser, or in a future Expo app.
import type { Dealer, Occasion, Watch, WatchType, WearLog } from "./database.types";
import { daysBetween, shiftDate } from "./dates";

export type WearRow = Pick<WearLog, "date" | "watch_id" | "occasion_id">;
export type Period = 30 | 90 | 365 | "all";
export const PERIODS: Period[] = [30, 90, 365, "all"];
export const periodLabel = (p: Period) => (p === "all" ? "All time" : `${p} days`);

/** Rows whose date falls inside the last `p` days (today counts as day 1). */
export function inPeriod<T extends { date: string }>(rows: T[], p: Period, today: string) {
  if (p === "all") return rows;
  const from = shiftDate(today, -(p - 1));
  return rows.filter((r) => r.date >= from && r.date <= today);
}

const countBy = <T,>(rows: T[], key: (r: T) => string | null | undefined) => {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};

// ---- per watch -------------------------------------------------------------

export type WatchRow = {
  watch: Watch;
  wears: number; // in the selected period
  allTime: number;
  lastWorn: string | null;
  daysSince: number | null; // null = never worn
  costPerWear: number | null; // purchase price / all-time wears
};

export function perWatch(watches: Watch[], wear: WearRow[], p: Period, today: string): WatchRow[] {
  const period = countBy(inPeriod(wear, p, today), (r) => r.watch_id);
  const all = countBy(wear, (r) => r.watch_id);
  const last = new Map<string, string>();
  for (const r of wear) if ((last.get(r.watch_id) ?? "") < r.date) last.set(r.watch_id, r.date);
  return watches.map((w) => {
    const allTime = all.get(w.id) ?? 0;
    const lastWorn = last.get(w.id) ?? null;
    return {
      watch: w,
      wears: period.get(w.id) ?? 0,
      allTime,
      lastWorn,
      daysSince: lastWorn ? daysBetween(lastWorn, today) : null,
      costPerWear: w.purchase_price != null && allTime > 0 ? w.purchase_price / allTime : null,
    };
  });
}

/** Owned watches not worn in at least `days` days (never-worn first, then oldest). */
export function neglected(rows: WatchRow[], days: number) {
  return rows
    .filter((r) => r.watch.status === "owned" && (r.daysSince == null || r.daysSince >= days))
    .sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity));
}

// ---- occasions -------------------------------------------------------------

export type OccasionSlice = { id: string; name: string; special: boolean; count: number };

export function occasionBreakdown(wear: WearRow[], occasions: Occasion[]) {
  const counts = countBy(wear, (r) => r.occasion_id ?? "none");
  const byId = new Map(occasions.map((o) => [o.id, o]));
  const slices: OccasionSlice[] = [...counts].map(([id, count]) => {
    const o = byId.get(id);
    return { id, name: o?.name ?? "No occasion", special: o?.is_special ?? false, count };
  });
  slices.sort((a, b) => b.count - a.count);
  const special = slices.filter((s) => s.special).reduce((n, s) => n + s.count, 0);
  return { slices, special, everyday: wear.length - special, total: wear.length };
}

/** Which watches get picked for special occasions. */
export function specialPicks(wear: WearRow[], occasions: Occasion[], watches: Watch[]) {
  const special = new Set(occasions.filter((o) => o.is_special).map((o) => o.id));
  const counts = countBy(wear.filter((r) => r.occasion_id && special.has(r.occasion_id)), (r) => r.watch_id);
  const byId = new Map(watches.map((w) => [w.id, w]));
  return [...counts]
    .map(([id, count]) => ({ watch: byId.get(id), count }))
    .filter((x): x is { watch: Watch; count: number } => !!x.watch)
    .sort((a, b) => b.count - a.count);
}

// ---- gen vs rep ------------------------------------------------------------

export type TypeSplit = { type: WatchType; count: number; spent: number; wears: number; share: number };

export function genVsRep(watches: Watch[], wear: WearRow[]): TypeSplit[] {
  const owned = watches.filter((w) => w.status === "owned");
  const typeOf = new Map(watches.map((w) => [w.id, w.type]));
  const wearsByType = countBy(wear, (r) => typeOf.get(r.watch_id));
  const total = wear.filter((r) => typeOf.has(r.watch_id)).length || 1;
  return (["genuine", "replica"] as const).map((type) => {
    const ws = owned.filter((w) => w.type === type);
    const wears = wearsByType.get(type) ?? 0;
    return { type, count: ws.length, spent: sum(ws.map((w) => w.purchase_price)), wears, share: wears / total };
  });
}

// ---- collection value ------------------------------------------------------

export type ValueGroup = { key: string; count: number; spent: number; genValue: number };

export function collectionValue(watches: Watch[], dealers: Dealer[]) {
  const owned = watches.filter((w) => w.status === "owned");
  const dealerName = new Map(dealers.map((d) => [d.id, d.name]));
  const group = (key: (w: Watch) => string): ValueGroup[] => {
    const m = new Map<string, Watch[]>();
    for (const w of owned) m.set(key(w), [...(m.get(key(w)) ?? []), w]);
    return [...m]
      .map(([k, ws]) => ({ key: k, count: ws.length, spent: sum(ws.map((w) => w.purchase_price)), genValue: sum(ws.map((w) => w.gen_retail_price)) }))
      .sort((a, b) => b.spent - a.spent || b.count - a.count);
  };
  return {
    spent: sum(owned.map((w) => w.purchase_price)),
    genValue: sum(owned.map((w) => w.gen_retail_price)),
    byBrand: group((w) => w.brand),
    byDealer: group((w) => (w.dealer_id ? dealerName.get(w.dealer_id) ?? "Unknown dealer" : "No dealer")),
  };
}

// ---- streaks + heatmap -----------------------------------------------------

/** Consecutive days with at least one log. Current streak survives until today is over. */
export function streaks(wear: WearRow[], today: string) {
  const days = [...new Set(wear.map((r) => r.date))].filter((d) => d <= today).sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const set = new Set(days);
  let current = 0;
  let cursor = set.has(today) ? today : shiftDate(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = shiftDate(cursor, -1);
  }
  return { current, longest, daysLogged: days.length };
}

/** Wears per day for the heatmap. */
export const wearsByDay = (wear: WearRow[]) => countBy(wear, (r) => r.date);

/** Wears per calendar month for the last `n` months (oldest first). */
export function monthlyWears(wear: WearRow[], today: string, n = 12) {
  const counts = countBy(wear, (r) => r.date.slice(0, 7));
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - (n - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { month: key, wears: counts.get(key) ?? 0 };
  });
}

function sum(xs: (number | null | undefined)[]) {
  return xs.reduce<number>((s, x) => s + (x ?? 0), 0);
}

// ---- CSV -------------------------------------------------------------------

export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}
