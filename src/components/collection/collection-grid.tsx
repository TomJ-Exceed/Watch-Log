"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Star } from "lucide-react";
import type { Dealer } from "@/lib/core/database.types";
import type { WatchCard } from "@/lib/core/queries";
import { agoLabel } from "@/lib/core/dates";
import { STATUS_LABEL, watchName } from "@/lib/core/format";
import { WatchThumb } from "@/components/watch-thumb";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Sort = "brand" | "recent" | "most" | "least" | "price" | "newest";
const SORTS: Record<Sort, string> = {
  brand: "Brand A–Z",
  recent: "Recently worn",
  most: "Most worn",
  least: "Least recently worn",
  price: "Price paid",
  newest: "Newest added",
};

export function CollectionGrid({ cards, dealers, today }: { cards: WatchCard[]; dealers: Dealer[]; today: string }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "genuine" | "replica">("all");
  const [status, setStatus] = useState<string>("owned");
  const [brand, setBrand] = useState("");
  const [dealer, setDealer] = useState("");
  const [sort, setSort] = useState<Sort>("brand");
  const [showFilters, setShowFilters] = useState(false);

  const brands = useMemo(() => [...new Set(cards.map((c) => c.brand))].sort(), [cards]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = cards.filter(
      (c) =>
        (type === "all" || c.type === type) &&
        (!status || c.status === status) &&
        (!brand || c.brand === brand) &&
        (!dealer || c.dealer_id === dealer) &&
        (!s || [c.brand, c.model, c.reference, c.dial_color, c.factory, c.notes].some((v) => v?.toLowerCase().includes(s))),
    );
    const cmp: Record<Sort, (a: WatchCard, b: WatchCard) => number> = {
      brand: (a, b) => watchName(a).localeCompare(watchName(b)),
      recent: (a, b) => (b.stats.last_worn ?? "").localeCompare(a.stats.last_worn ?? ""),
      least: (a, b) => (a.stats.last_worn ?? "").localeCompare(b.stats.last_worn ?? ""),
      most: (a, b) => (b.stats.wear_count ?? 0) - (a.stats.wear_count ?? 0),
      price: (a, b) => (b.purchase_price ?? 0) - (a.purchase_price ?? 0),
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
    };
    return out.sort(cmp[sort]);
  }, [cards, q, type, status, brand, dealer, sort]);

  const activeFilters = [brand, dealer, status !== "owned" ? status : ""].filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand, model, ref…" className="pl-9" />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={cn("relative flex size-11 items-center justify-center rounded-xl border border-border", showFilters && "bg-secondary")}
          aria-label="Filters"
        >
          <SlidersHorizontal className="size-4" />
          {activeFilters > 0 && <span className="absolute -right-1 -top-1 size-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{activeFilters}</span>}
        </button>
      </div>

      <div className="flex gap-1.5">
        {(["all", "genuine", "replica"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn("rounded-full border px-3 py-1.5 text-[13px] font-medium", type === t ? "border-primary bg-primary text-primary-foreground" : "border-border")}
          >
            {t === "all" ? "All" : t === "genuine" ? "Gen" : "Rep"}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-3">
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
          <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
          <NativeSelect value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">All brands</option>
            {brands.map((b) => <option key={b}>{b}</option>)}
          </NativeSelect>
          <NativeSelect value={dealer} onChange={(e) => setDealer(e.target.value)}>
            <option value="">All dealers</option>
            {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </NativeSelect>
        </div>
      )}

      {list.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">Nothing matches.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {list.map((c) => (
            <Link key={c.id} href={`/watch/${c.id}`} className="group">
              <div className="relative">
                <WatchThumb url={c.photo_url} alt={watchName(c)} />
                <div className="absolute left-2 top-2 flex gap-1">
                  <Badge variant={c.type === "genuine" ? "gen" : "rep"} className="bg-black/60 backdrop-blur">
                    {c.type === "genuine" ? "Gen" : c.factory ? `Rep · ${c.factory}` : "Rep"}
                  </Badge>
                </div>
                {c.is_favorite && <Star className="absolute right-2 top-2 size-4 fill-primary text-primary drop-shadow" />}
              </div>
              <p className="mt-2 truncate text-sm font-semibold leading-tight">{c.brand}</p>
              <p className="truncate text-[13px] leading-tight text-secondary-foreground">{c.model}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {c.status !== "owned" ? STATUS_LABEL[c.status] : `${c.stats.wear_count} wears · ${agoLabel(c.stats.last_worn, today).toLowerCase()}`}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
