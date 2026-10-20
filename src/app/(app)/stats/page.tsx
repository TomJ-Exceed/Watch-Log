import Link from "next/link";
import { getToday, requireUser } from "@/lib/supabase/server";
import { listWatchCards } from "@/lib/core/queries";
import { agoLabel } from "@/lib/core/dates";
import { money, watchName } from "@/lib/core/format";
import { WatchThumb } from "@/components/watch-thumb";

// Phase 1 snapshot. Full analytics (charts, heatmap, CSV export) land in Phase 2.
export default async function StatsPage() {
  const { supabase } = await requireUser();
  const [cards, today] = await Promise.all([listWatchCards(supabase), getToday()]);
  const owned = cards.filter((c) => c.status === "owned");
  const gen = owned.filter((c) => c.type === "genuine");
  const rep = owned.filter((c) => c.type === "replica");
  const spent = owned.reduce((s, c) => s + (c.purchase_price ?? 0), 0);
  const genValue = owned.reduce((s, c) => s + (c.gen_retail_price ?? 0), 0);
  const wears30 = owned.reduce((s, c) => s + (c.stats.wears_30 ?? 0), 0);
  const top = [...owned].sort((a, b) => (b.stats.wears_30 ?? 0) - (a.stats.wears_30 ?? 0)).slice(0, 5);
  const max = Math.max(1, ...top.map((c) => c.stats.wears_30 ?? 0));
  const neglected = [...owned].sort((a, b) => (a.stats.last_worn ?? "").localeCompare(b.stats.last_worn ?? "")).slice(0, 3);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Stats</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight">Snapshot</h1>
      </header>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Owned" value={`${owned.length}`} sub={`${gen.length} gen · ${rep.length} rep`} />
        <Tile label="Wears, 30 days" value={`${wears30}`} />
        <Tile label="Total spent" value={money(spent)} />
        <Tile label="Gen-equivalent value" value={money(genValue)} />
      </div>
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Most worn · 30 days</h2>
        {top.map((c) => (
          <Link key={c.id} href={`/watch/${c.id}`} className="flex items-center gap-3">
            <WatchThumb url={c.photo_url} alt="" className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{watchName(c)}</p>
              <div className="mt-1 h-1.5 rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${((c.stats.wears_30 ?? 0) / max) * 100}%` }} />
              </div>
            </div>
            <span className="w-6 text-right text-sm tabular text-muted-foreground">{c.stats.wears_30}</span>
          </Link>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Needs wrist time</h2>
        {neglected.map((c) => (
          <Link key={c.id} href={`/watch/${c.id}`} className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 text-sm">
            <span className="truncate">{watchName(c)}</span>
            <span className="shrink-0 text-muted-foreground">{agoLabel(c.stats.last_worn, today)}</span>
          </Link>
        ))}
      </section>
      <p className="text-center text-xs text-muted-foreground">Charts, cost per wear, heatmap and CSV export arrive in Phase 2.</p>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <p className="text-xl font-semibold tabular">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && <p className="mt-1 text-[11px] text-secondary-foreground">{sub}</p>}
    </div>
  );
}
