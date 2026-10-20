import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getToday, requireUser } from "@/lib/supabase/server";
import { listOccasions, listWatchCards, listWearRange } from "@/lib/core/queries";
import { fmt, monthGrid, shiftDate } from "@/lib/core/dates";
import { watchName } from "@/lib/core/format";
import { WatchThumb } from "@/components/watch-thumb";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const { month } = await searchParams;
  const today = await getToday();
  const anchor = typeof month === "string" && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : `${today.slice(0, 7)}-01`;
  const grid = monthGrid(anchor);
  const { supabase } = await requireUser();
  const [logs, cards, occasions] = await Promise.all([
    listWearRange(supabase, grid[0], grid[grid.length - 1]),
    listWatchCards(supabase),
    listOccasions(supabase),
  ]);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const special = new Set(occasions.filter((o) => o.is_special).map((o) => o.id));
  const prev = shiftDate(anchor, -1).slice(0, 7);
  const next = shiftDate(anchor, 32).slice(0, 7);
  const monthKey = anchor.slice(0, 7);
  const inMonth = logs.filter((l) => l.date.startsWith(monthKey));
  const daysLogged = new Set(inMonth.map((l) => l.date)).size;
  const distinct = new Set(inMonth.map((l) => l.watch_id)).size;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Wear history</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">{fmt(anchor, "MMMM yyyy")}</h1>
        </div>
        <div className="flex">
          <Button asChild variant="ghost" size="icon" aria-label="Previous month">
            <Link href={`/calendar?month=${prev}`}><ChevronLeft /></Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Next month" className={cn(monthKey >= today.slice(0, 7) && "pointer-events-none opacity-30")}>
            <Link href={`/calendar?month=${next}`}><ChevronRight /></Link>
          </Button>
        </div>
      </header>

      <p className="text-sm text-muted-foreground">
        {daysLogged} day{daysLogged === 1 ? "" : "s"} logged · {distinct} watch{distinct === 1 ? "" : "es"} worn
      </p>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-muted-foreground">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="-mt-3 grid grid-cols-7 gap-1">
        {grid.map((d) => {
          const dayLogs = logs.filter((l) => l.date === d);
          const first = dayLogs[0] ? byId.get(dayLogs[0].watch_id) : undefined;
          const isSpecial = dayLogs.some((l) => l.occasion_id && special.has(l.occasion_id));
          const out = !d.startsWith(monthKey);
          const future = d > today;
          return (
            <Link
              key={d}
              href={future ? "#" : d === today ? "/" : `/day/${d}`}
              className={cn("relative aspect-square overflow-hidden rounded-lg bg-card", out && "opacity-35", future && "pointer-events-none opacity-25", d === today && "ring-2 ring-primary")}
            >
              {first && <WatchThumb url={first.photo_url} alt={watchName(first)} className="absolute inset-0 rounded-none" iconClass="size-1/2" />}
              <span className={cn("absolute left-1 top-0.5 text-[10px] font-semibold tabular", first ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" : "text-muted-foreground")}>
                {fmt(d, "d")}
              </span>
              {isSpecial && <span className="absolute bottom-1 right-1 size-1.5 rounded-full bg-primary shadow" />}
              {dayLogs.length > 1 && <span className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 text-[9px] font-bold text-white">{dayLogs.length}</span>}
            </Link>
          );
        })}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-primary" /> special occasion · tap any day to log or edit
      </p>

      {inMonth.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Most worn this month</h2>
          {Object.entries(inMonth.reduce<Record<string, number>>((a, l) => ((a[l.watch_id] = (a[l.watch_id] ?? 0) + 1), a), {}))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id, n]) => {
              const w = byId.get(id);
              if (!w) return null;
              return (
                <Link key={id} href={`/watch/${id}`} className="flex items-center gap-3 rounded-2xl bg-card p-2">
                  <WatchThumb url={w.photo_url} alt={watchName(w)} className="size-11 shrink-0 rounded-xl" />
                  <span className="flex-1 truncate text-sm font-medium">{watchName(w)}</span>
                  <span className="pr-2 text-sm text-muted-foreground tabular">{n}×</span>
                </Link>
              );
            })}
        </section>
      )}
    </div>
  );
}
