"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Plus, RefreshCw, Search, Sparkles, Star, Trash2, X, Zap } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Occasion, Strap, WearLog } from "@/lib/core/database.types";
import { neglectedPick, pickerOrder, type WatchCard } from "@/lib/core/queries";
import { agoLabel, daysBetween, fmt, shiftDate } from "@/lib/core/dates";
import { watchName } from "@/lib/core/format";
import { WatchThumb } from "@/components/watch-thumb";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  date: string;
  today: string;
  cards: WatchCard[];
  occasions: Occasion[];
  straps: Strap[];
  weekLogs: WearLog[];
  week: string[];
};

const dayHref = (d: string, today: string) => (d === today ? "/" : `/day/${d}`);

export function WristCheck({ date, today, cards, occasions, straps, weekLogs, week }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const occById = useMemo(() => new Map(occasions.map((o) => [o.id, o])), [occasions]);
  const defaultOccasion = occasions.find((o) => o.is_default) ?? occasions[0];

  const entries = weekLogs.filter((l) => l.date === date);
  const owned = useMemo(() => pickerOrder(cards.filter((c) => c.status === "owned"), today), [cards, today]);
  const neglected = useMemo(() => neglectedPick(cards, today), [cards, today]);

  // picker state
  const [picking, setPicking] = useState(entries.length === 0);
  const [editing, setEditing] = useState<WearLog | null>(null);
  const [query, setQuery] = useState("");
  const [watchId, setWatchId] = useState<string | null>(null);
  const [occasionId, setOccasionId] = useState<string | undefined>(defaultOccasion?.id);
  const [detail, setDetail] = useState("");
  const [note, setNote] = useState("");
  const [strapId, setStrapId] = useState<string>("");
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string>();

  const isToday = date === today;
  const isPicking = picking || entries.length === 0;
  const occasion = occasionId ? occById.get(occasionId) : undefined;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return owned;
    return owned.filter((c) =>
      [c.brand, c.model, c.reference, c.dial_color, c.factory].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [owned, query]);

  function startPick(opts: { edit?: WearLog; preselect?: string } = {}) {
    setEditing(opts.edit ?? null);
    const wid = opts.edit?.watch_id ?? opts.preselect ?? null;
    setWatchId(wid);
    setOccasionId(opts.edit?.occasion_id ?? defaultOccasion?.id);
    setDetail(opts.edit?.occasion_detail ?? "");
    setNote(opts.edit?.notes ?? "");
    setStrapId(opts.edit?.strap_id ?? (wid ? byId.get(wid)?.strap_id ?? "" : ""));
    setShowMore(Boolean(opts.edit?.notes || opts.edit?.strap_id));
    setQuery("");
    setError(undefined);
    setPicking(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function choose(id: string) {
    setWatchId(id === watchId ? null : id);
    if (id !== watchId) setStrapId(byId.get(id)?.strap_id ?? "");
  }

  async function save() {
    if (!watchId) return;
    setError(undefined);
    const sb = supabaseBrowser();
    const row = {
      date,
      watch_id: watchId,
      occasion_id: occasionId ?? null,
      occasion_detail: occasion?.is_special && detail.trim() ? detail.trim() : null,
      notes: note.trim() || null,
      strap_id: strapId || null,
    };
    const { error } = editing
      ? await sb.from("wear_log").update(row).eq("id", editing.id)
      : await sb.from("wear_log").insert(row);
    if (error) return setError(error.message);
    navigator.vibrate?.(15);
    setPicking(false);
    setEditing(null);
    startTransition(() => router.refresh());
  }

  async function remove(id: string) {
    if (!confirm("Remove this entry?")) return;
    const { error } = await supabaseBrowser().from("wear_log").delete().eq("id", id);
    if (error) return setError(error.message);
    startTransition(() => router.refresh());
  }

  const selected = watchId ? byId.get(watchId) : undefined;

  return (
    <div className={cn("space-y-6", isPicking && selected && "pb-56")}>
      {/* HEADER */}
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            {isToday ? "Wrist check" : daysBetween(date, today) === 1 ? "Yesterday" : "Past day"}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight">{fmt(date, "EEEE, MMM d")}</h1>
        </div>
        <div className="flex items-center gap-1">
          {isToday && (
            <Button asChild variant="ghost" size="icon" aria-label="Quick log">
              <Link href="/quick"><Zap className="text-primary" /></Link>
            </Button>
          )}
          <Button asChild variant="ghost" size="icon" aria-label="Previous day">
            <Link href={dayHref(shiftDate(date, -1), today)}>
              <ChevronLeft />
            </Link>
          </Button>
          {isToday ? (
            <span className="size-10" />
          ) : (
            <Button asChild variant="ghost" size="icon" aria-label="Next day">
              <Link href={dayHref(shiftDate(date, 1), today)}>
                <ChevronRight />
              </Link>
            </Button>
          )}
        </div>
      </header>

      {/* LOGGED ENTRIES */}
      {entries.length > 0 && !isPicking && (
        <section className="space-y-3">
          {entries.map((e, i) => {
            const w = byId.get(e.watch_id);
            const occ = e.occasion_id ? occById.get(e.occasion_id) : undefined;
            const strap = e.strap_id ? straps.find((s) => s.id === e.strap_id) : undefined;
            return (
              <div key={e.id} className="overflow-hidden rounded-3xl border border-border bg-card">
                <Link href={w ? `/watch/${w.id}` : "#"}>
                  <WatchThumb url={w?.photo_url ?? null} alt={w ? watchName(w) : ""} className="aspect-[4/3] rounded-none" />
                </Link>
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {entries.length > 1 && <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Watch {i + 1}</p>}
                      <h2 className="text-lg font-semibold leading-snug">{w ? watchName(w) : "Deleted watch"}</h2>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {occ && <Badge variant={occ.is_special ? "accent" : "default"}>{occ.name}</Badge>}
                        {e.occasion_detail && <Badge variant="accent">{e.occasion_detail}</Badge>}
                        {strap && <Badge>{strap.name}</Badge>}
                      </div>
                    </div>
                    <button onClick={() => remove(e.id)} className="p-1.5 text-muted-foreground hover:text-destructive" aria-label="Remove entry">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {e.notes && <p className="text-sm text-muted-foreground">{e.notes}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={() => startPick({ edit: e })}>
                      <RefreshCw /> Change
                    </Button>
                    {i === entries.length - 1 && (
                      <Button variant="outline" onClick={() => startPick()}>
                        <Plus /> Add swap
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* PICKER */}
      {isPicking && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {editing ? "Change watch" : entries.length ? "Add a swap" : isToday ? "What's on the wrist?" : "What did you wear?"}
            </h2>
            {entries.length > 0 && (
              <button onClick={() => { setPicking(false); setEditing(null); }} className="text-sm text-muted-foreground">
                Cancel
              </button>
            )}
          </div>
          {owned.length > 6 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search watches" className="pl-9" />
            </div>
          )}
          {owned.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border p-8 text-center">
              <p className="text-muted-foreground">No watches yet.</p>
              <Button asChild className="mt-4">
                <Link href="/watch/new"><Plus /> Add your first watch</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              {filtered.map((c) => {
                const on = c.id === watchId;
                return (
                  <button key={c.id} onClick={() => choose(c.id)} className="group text-left">
                    <div className={cn("relative rounded-2xl ring-2 ring-transparent transition", on && "ring-primary")}>
                      <WatchThumb url={c.photo_url} alt={watchName(c)} />
                      {on && (
                        <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-4" strokeWidth={3} />
                        </span>
                      )}
                      {c.is_favorite && !on && <Star className="absolute right-2 top-2 size-3.5 fill-primary text-primary drop-shadow" />}
                    </div>
                    <p className="mt-1.5 truncate text-[13px] font-medium leading-tight">{c.brand}</p>
                    <p className="truncate text-[12px] leading-tight text-muted-foreground">{c.model}</p>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* WEEK STRIP */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">This week</h2>
          <Link href={`/calendar?month=${date.slice(0, 7)}`} className="text-xs text-primary">Calendar</Link>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {week.map((d) => {
            const logs = weekLogs.filter((l) => l.date === d);
            const first = logs[0] ? byId.get(logs[0].watch_id) : undefined;
            const future = d > today;
            return (
              <Link
                key={d}
                href={future ? "#" : dayHref(d, today)}
                aria-disabled={future}
                className={cn("flex flex-col items-center gap-1", future && "pointer-events-none opacity-40")}
              >
                <span className={cn("text-[10px] font-medium uppercase", d === date ? "text-primary" : "text-muted-foreground")}>{fmt(d, "EEEEE")}</span>
                <div className={cn("relative w-full rounded-xl ring-1 ring-border", d === date && "ring-2 ring-primary")}>
                  {first ? (
                    <WatchThumb url={first.photo_url} alt={watchName(first)} className="rounded-xl" iconClass="size-1/2" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-xl bg-card text-[11px] text-muted-foreground tabular">{fmt(d, "d")}</div>
                  )}
                  {logs.length > 1 && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">+{logs.length - 1}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* NEGLECTED SUGGESTION */}
      {neglected && !isPicking && (
        <section className="flex items-center gap-3 rounded-3xl border border-border bg-card p-3">
          <WatchThumb url={neglected.photo_url} alt={watchName(neglected)} className="size-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-primary">
              <Sparkles className="size-3" /> Give it some wrist time
            </p>
            <p className="truncate font-medium">{watchName(neglected)}</p>
            <p className="text-xs text-muted-foreground">{agoLabel(neglected.stats.last_worn, today)}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => startPick({ preselect: neglected.id })}>
            Wear
          </Button>
        </section>
      )}
      {neglected && isPicking && !selected && (
        <button onClick={() => choose(neglected.id)} className="block w-full rounded-2xl border border-dashed border-border px-3 py-2.5 text-left text-xs leading-relaxed text-muted-foreground">
          <Sparkles className="mr-1.5 inline size-3.5 align-[-2px] text-primary" />
          Haven&apos;t worn the <span className="font-medium text-foreground">{watchName(neglected)}</span> in a while ({agoLabel(neglected.stats.last_worn, today).toLowerCase()}). Tap to pick it.
        </button>
      )}

      {/* SAVE PANEL */}
      {isPicking && selected && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.75rem)] z-30">
          <div className="mx-auto max-w-lg px-3">
            <div className="space-y-3 rounded-3xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur-xl">
              <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
                {occasions.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setOccasionId(o.id)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
                      o.id === occasionId ? "border-primary bg-primary text-primary-foreground" : "border-border text-secondary-foreground",
                    )}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
              {occasion?.is_special && (
                <Input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="What was it? e.g. sister's wedding" className="h-10" />
              )}
              {showMore && (
                <div className="space-y-2">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="h-10" />
                  {straps.length > 0 && (
                    <NativeSelect value={strapId} onChange={(e) => setStrapId(e.target.value)} className="h-10">
                      <option value="">No strap noted</option>
                      {straps.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </NativeSelect>
                  )}
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMore((v) => !v)}
                  className="flex h-12 shrink-0 items-center rounded-xl px-3 text-sm text-muted-foreground hover:bg-secondary"
                >
                  {showMore ? <X className="size-4" /> : "+ Note"}
                </button>
                <Button size="lg" className="h-12 flex-1" onClick={save} disabled={pending}>
                  <Check /> {editing ? "Update" : "Save"} · <span className="truncate">{selected.brand} {selected.model}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
