import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { getToday, requireUser } from "@/lib/supabase/server";
import { getWatch, listOccasions, listStraps, listWearForWatch, listDealers } from "@/lib/core/queries";
import { agoLabel, daysBetween, fmt } from "@/lib/core/dates";
import { DEALER_TYPE_LABEL, money, STATUS_LABEL, watchName } from "@/lib/core/format";
import { WatchThumb } from "@/components/watch-thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FavoriteToggle, QuickLinkButton, WearTodayButton } from "@/components/watch/watch-actions";

export default async function WatchDetailPage({ params }: PageProps<"/watch/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [data, history, occasions, straps, dealers, today] = await Promise.all([
    getWatch(supabase, id),
    listWearForWatch(supabase, id),
    listOccasions(supabase),
    listStraps(supabase),
    listDealers(supabase),
    getToday(),
  ]);
  if (!data) notFound();
  const { watch: w, photos } = data;
  const occ = new Map(occasions.map((o) => [o.id, o]));
  const strap = straps.find((s) => s.id === w.strap_id);
  const strapById = new Map(straps.map((s) => [s.id, s]));
  const dealer = dealers.find((d) => d.id === w.dealer_id);
  const defaultOcc = occasions.find((o) => o.is_default);

  const total = history.length;
  const within = (n: number) => history.filter((h) => daysBetween(h.date, today) < n).length;
  const lastWorn = history[0]?.date ?? null;
  const specialCount = history.filter((h) => h.occasion_id && occ.get(h.occasion_id)?.is_special).length;
  const costPerWear = w.purchase_price != null && total > 0 ? w.purchase_price / total : null;
  const isRep = w.type === "replica";

  const rows: [string, string | null | undefined][] = [
    ["Reference", w.reference],
    ...(isRep ? ([["Factory", [w.factory, w.factory_version].filter(Boolean).join(" · ")]] as [string, string][]) : []),
    ["Dial", w.dial_color],
    ["Case", [w.case_size_mm && `${w.case_size_mm} mm`, w.case_material].filter(Boolean).join(" · ")],
    ["Movement", w.movement],
    ["Strap", strap?.name],
    ["Condition", w.condition],
    ["Serial", w.serial],
    ["Dealer", dealer ? `${dealer.name}${dealer.type ? ` (${DEALER_TYPE_LABEL[dealer.type]})` : ""}` : null],
    ["Purchased", w.purchase_date ? fmt(w.purchase_date, "MMM d, yyyy") : null],
    ["Price paid", w.purchase_price != null ? money(w.purchase_price, w.currency) : null],
    [isRep ? "Genuine retail" : "MSRP / market", w.gen_retail_price != null ? money(w.gen_retail_price, w.currency) : null],
    ["Status", STATUS_LABEL[w.status]],
    ...(w.sale_date || w.sale_price ? ([[w.status === "traded" ? "Traded" : "Sold", [w.sale_date && fmt(w.sale_date, "MMM d, yyyy"), w.sale_price != null && money(w.sale_price, w.currency)].filter(Boolean).join(" · ")]] as [string, string][]) : []),
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <Link href="/collection" className="-ml-2 p-2 text-muted-foreground" aria-label="Back"><ChevronLeft className="size-5" /></Link>
        <Button asChild variant="ghost" size="sm"><Link href={`/watch/${id}/edit`}><Pencil /> Edit</Link></Button>
      </header>

      {/* GALLERY */}
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4">
        {photos.length ? (
          photos.map((p) => <WatchThumb key={p.id} url={p.url} alt={watchName(w)} className="w-[85%] shrink-0 snap-center rounded-3xl" />)
        ) : (
          <Link href={`/watch/${id}/edit`} className="w-full">
            <WatchThumb url={null} alt="" className="aspect-[4/3] w-full rounded-3xl" />
            <p className="mt-2 text-center text-xs text-muted-foreground">Tap Edit to add photos</p>
          </Link>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={isRep ? "rep" : "gen"}>{isRep ? "Replica" : "Genuine"}</Badge>
          {w.status !== "owned" && <Badge>{STATUS_LABEL[w.status]}</Badge>}
        </div>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight">{w.brand}<br /><span className="text-secondary-foreground">{w.model}</span></h1>
        <p className="text-sm text-muted-foreground">{agoLabel(lastWorn, today)}</p>
      </div>

      {w.status === "owned" && (
        <div className="flex gap-2">
          <WearTodayButton watchId={w.id} today={today} occasionId={defaultOcc?.id} strapId={w.strap_id} wornToday={history.some((h) => h.date === today)} />
          <FavoriteToggle watchId={w.id} initial={w.is_favorite} />
        </div>
      )}
      {w.status === "owned" && <QuickLinkButton watchId={w.id} />}

      {/* STATS */}
      <section className="grid grid-cols-3 gap-2">
        <Stat label="All time" value={total} />
        <Stat label="30 days" value={within(30)} />
        <Stat label="90 days" value={within(90)} />
        <Stat label="365 days" value={within(365)} />
        <Stat label="Special" value={specialCount} />
        <Stat label="Cost / wear" value={costPerWear != null ? money(Math.round(costPerWear), w.currency) : "—"} />
      </section>

      {/* DETAILS */}
      <section className="divide-y divide-border rounded-3xl border border-border bg-card">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className="text-right font-medium">{v}</span>
          </div>
        ))}
      </section>
      {w.notes && !w.notes.startsWith("[sample]") && <p className="whitespace-pre-wrap rounded-3xl bg-card p-4 text-sm text-secondary-foreground">{w.notes}</p>}

      {/* HISTORY */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Wear history</h2>
        {history.length === 0 && <p className="text-sm text-muted-foreground">Not worn yet.</p>}
        <div className="divide-y divide-border rounded-3xl border border-border bg-card">
          {history.slice(0, 60).map((h) => {
            const o = h.occasion_id ? occ.get(h.occasion_id) : undefined;
            const s = h.strap_id ? strapById.get(h.strap_id) : undefined;
            return (
              <Link key={h.id} href={h.date === today ? "/" : `/day/${h.date}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="tabular text-secondary-foreground">{fmt(h.date, "EEE, MMM d, yyyy")}</span>
                <span className="flex flex-wrap justify-end gap-1">
                  {o && <Badge variant={o.is_special ? "accent" : "default"}>{h.occasion_detail || o.name}</Badge>}
                  {s && <Badge>{s.name}</Badge>}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-card p-3">
      <p className="text-lg font-semibold tabular">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
