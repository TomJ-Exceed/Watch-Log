"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Flame } from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { Dealer, Occasion, Strap, WearLog } from "@/lib/core/database.types";
import type { WatchCard } from "@/lib/core/queries";
import {
  PERIODS, type Period, collectionValue, genVsRep, inPeriod, monthlyWears, neglected, occasionBreakdown,
  perWatch, periodLabel, specialPicks, streaks, toCSV,
} from "@/lib/core/analytics";
import { fmt } from "@/lib/core/dates";
import { money, watchName } from "@/lib/core/format";
import { WatchThumb } from "@/components/watch-thumb";
import { Heatmap } from "./heatmap";
import { cn } from "@/lib/utils";

type Props = { cards: WatchCard[]; wear: WearLog[]; occasions: Occasion[]; dealers: Dealer[]; straps: Strap[]; today: string };

const BRASS = "#d8b46a";
const PALETTE = [BRASS, "#a88a4f", "#7d6a45", "#5c5140", "#c9c3b5", "#8d8b86", "#3f3d3a"];
const NEGLECT_OPTIONS = [14, 30, 60, 90];

export function StatsDashboard({ cards, wear, occasions, dealers, straps, today }: Props) {
  const [period, setPeriod] = useState<Period>(30);
  const [neglectDays, setNeglectDays] = useState(30);
  const [valueBy, setValueBy] = useState<"brand" | "dealer">("brand");
  const photo = useMemo(() => new Map(cards.map((c) => [c.id, c.photo_url])), [cards]);
  const watches = cards;

  const rows = useMemo(() => perWatch(watches, wear, period, today), [watches, wear, period, today]);
  const periodWear = useMemo(() => inPeriod(wear, period, today), [wear, period, today]);
  const ranked = rows.filter((r) => r.watch.status === "owned" || r.wears > 0).sort((a, b) => b.wears - a.wears || b.allTime - a.allTime);
  const maxWears = Math.max(1, ...ranked.map((r) => r.wears));
  const owned = rows.filter((r) => r.watch.status === "owned");
  const cpw = owned.filter((r) => r.watch.purchase_price != null).sort((a, b) => (a.costPerWear ?? Infinity) - (b.costPerWear ?? Infinity));
  const stale = neglected(rows, neglectDays);
  const occ = occasionBreakdown(periodWear, occasions);
  const picks = specialPicks(periodWear, occasions, watches).slice(0, 5);
  const types = genVsRep(watches, wear);
  const value = collectionValue(watches, dealers);
  const streak = streaks(wear, today);
  const months = monthlyWears(wear, today);

  function exportCSV() {
    const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const w = byId(watches), o = byId(occasions), d = byId(dealers), s = byId(straps);
    download(`wrist-check-watches-${today}.csv`, toCSV(watches.map((x) => ({
      brand: x.brand, model: x.model, reference: x.reference, type: x.type, status: x.status, factory: x.factory,
      factory_version: x.factory_version, dial: x.dial_color, case_mm: x.case_size_mm, case_material: x.case_material,
      movement: x.movement, dealer: x.dealer_id ? d.get(x.dealer_id)?.name : "", purchase_date: x.purchase_date,
      purchase_price: x.purchase_price, currency: x.currency, gen_retail_price: x.gen_retail_price, sale_date: x.sale_date,
      sale_price: x.sale_price, favorite: x.is_favorite, condition: x.condition, serial: x.serial, notes: x.notes,
      wears_all_time: rows.find((r) => r.watch.id === x.id)?.allTime ?? 0,
    }))));
    download(`wrist-check-wear-log-${today}.csv`, toCSV(wear.map((r) => {
      const x = w.get(r.watch_id);
      return {
        date: r.date, brand: x?.brand, model: x?.model, reference: x?.reference, type: x?.type,
        occasion: r.occasion_id ? o.get(r.occasion_id)?.name : "", occasion_detail: r.occasion_detail,
        strap: r.strap_id ? s.get(r.strap_id)?.name : "", notes: r.notes,
      };
    })));
  }

  return (
    <div className="space-y-7">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Stats</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">Analytics</h1>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-xs font-medium text-secondary-foreground">
          <Download className="size-3.5" /> Export CSV
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Owned" value={`${owned.length}`} sub={`${types[0].count} gen · ${types[1].count} rep`} />
        <Tile label={`Wears · ${periodLabel(period).toLowerCase()}`} value={`${periodWear.length}`} sub={`${streak.daysLogged} days logged all time`} />
        <Tile label="Current streak" value={`${streak.current} ${streak.current === 1 ? "day" : "days"}`} icon={streak.current > 0} />
        <Tile label="Longest streak" value={`${streak.longest} ${streak.longest === 1 ? "day" : "days"}`} />
      </div>

      <Segmented value={period} options={PERIODS} label={periodLabel} onChange={setPeriod} />

      <Section title="Wears per watch" note={periodLabel(period)}>
        {ranked.length === 0 && <Empty />}
        {ranked.map((r) => (
          <Link key={r.watch.id} href={`/watch/${r.watch.id}`} className="flex items-center gap-3">
            <WatchThumb url={photo.get(r.watch.id) ?? null} alt="" className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{watchName(r.watch)}</p>
              <div className="mt-1 h-1.5 rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(r.wears / maxWears) * 100}%` }} />
              </div>
            </div>
            <span className="w-8 text-right text-sm tabular text-muted-foreground">{r.wears}</span>
          </Link>
        ))}
      </Section>

      <Section title="Occasions" note={periodLabel(period)}>
        {occ.total === 0 ? <Empty /> : (
          <>
            <div className="flex items-center gap-4">
              <div className="relative size-32 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={occ.slices} dataKey="count" nameKey="name" innerRadius={40} outerRadius={62} stroke="none" isAnimationActive={false}>
                      {occ.slices.map((s, i) => <Cell key={s.id} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="text-lg font-semibold tabular">{Math.round((occ.special / occ.total) * 100)}%</p>
                    <p className="text-[10px] text-muted-foreground">special</p>
                  </div>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
                {occ.slices.slice(0, 6).map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="truncate">{s.name}</span>
                    <span className="ml-auto tabular text-muted-foreground">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">{occ.everyday} everyday · {occ.special} special occasion</p>
            {picks.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Special occasion picks</p>
                {picks.map((p) => (
                  <Row key={p.watch.id} href={`/watch/${p.watch.id}`} left={watchName(p.watch)} right={`${p.count}×`} />
                ))}
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Needs wrist time">
        <Segmented value={neglectDays} options={NEGLECT_OPTIONS} label={(n) => `${n}+ days`} onChange={setNeglectDays} small />
        {stale.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Everything&apos;s been worn in the last {neglectDays} days.</p>
        ) : (
          stale.map((r) => (
            <Row key={r.watch.id} href={`/watch/${r.watch.id}`} left={watchName(r.watch)} right={r.daysSince == null ? "Never worn" : `${r.daysSince} days`} />
          ))
        )}
      </Section>

      <Section title="Cost per wear" note="Purchase price ÷ all-time wears">
        {cpw.length === 0 ? <Empty text="Add purchase prices to see cost per wear." /> : cpw.map((r) => (
          <Row
            key={r.watch.id}
            href={`/watch/${r.watch.id}`}
            left={watchName(r.watch)}
            sub={`${money(r.watch.purchase_price, r.watch.currency)} · ${r.allTime} ${r.allTime === 1 ? "wear" : "wears"}`}
            right={r.costPerWear == null ? "Not worn" : money(Math.round(r.costPerWear * 100) / 100, r.watch.currency)}
          />
        ))}
      </Section>

      <Section title="Genuine vs replica">
        <div className="grid grid-cols-2 gap-2">
          {types.map((t) => (
            <div key={t.type} className="rounded-2xl bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.type === "genuine" ? "Genuine" : "Replica"}</p>
              <p className="mt-1 text-xl font-semibold tabular">{t.count}</p>
              <p className="text-xs text-muted-foreground">{money(t.spent)} spent</p>
              <p className="text-xs text-muted-foreground">{Math.round(t.share * 100)}% of wears</p>
            </div>
          ))}
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
          <div className="bg-primary" style={{ width: `${types[0].share * 100}%` }} />
          <div className="bg-[#7d6a45]" style={{ width: `${types[1].share * 100}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">Wear share, all time</p>
      </Section>

      <Section title="Collection value" note="Owned watches">
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Total spent" value={money(value.spent)} />
          <Tile label="Gen-equivalent value" value={money(value.genValue)} />
        </div>
        <Segmented value={valueBy} options={["brand", "dealer"] as const} label={(v) => (v === "brand" ? "By brand" : "By dealer")} onChange={setValueBy} small />
        <div className="overflow-hidden rounded-2xl bg-card">
          {(valueBy === "brand" ? value.byBrand : value.byDealer).map((g) => (
            <div key={g.key} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-sm last:border-0">
              <div className="min-w-0">
                <p className="truncate">{g.key}</p>
                <p className="text-xs text-muted-foreground">{g.count} {g.count === 1 ? "watch" : "watches"}</p>
              </div>
              <div className="text-right">
                <p className="tabular">{money(g.spent)}</p>
                {valueBy === "brand" && <p className="text-xs tabular text-muted-foreground">gen {money(g.genValue)}</p>}
              </div>
            </div>
          ))}
          {value.byBrand.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No owned watches yet.</p>}
        </div>
      </Section>

      <Section title="Wears per month" note="Last 12 months">
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="month" tickFormatter={(m: string) => fmt(`${m}-01`, "MMMMM")} tickLine={false} axisLine={false} interval={0} tick={{ fill: "#8d8b86", fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{ background: "#141417", border: "1px solid #2a2a2f", borderRadius: 12, fontSize: 12 }}
                labelFormatter={(m) => fmt(`${m}-01`, "MMMM yyyy")}
                formatter={(v) => [v, "Wears"]}
              />
              <Bar dataKey="wears" fill={BRASS} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Wear heatmap" note="Last 12 months">
        <Heatmap wear={wear} today={today} />
      </Section>
    </div>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: boolean }) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <p className="flex items-center gap-1.5 text-xl font-semibold tabular">
        {icon && <Flame className="size-4 text-primary" />}
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && <p className="mt-1 text-[11px] text-secondary-foreground">{sub}</p>}
    </div>
  );
}

function Row({ href, left, sub, right }: { href: string; left: string; sub?: string; right: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="truncate">{left}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
      <span className="shrink-0 tabular text-muted-foreground">{right}</span>
    </Link>
  );
}

function Segmented<T extends string | number>({ value, options, label, onChange, small }: {
  value: T; options: readonly T[]; label: (v: T) => string; onChange: (v: T) => void; small?: boolean;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-card p-1">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "flex-1 rounded-full font-medium transition-colors",
            small ? "py-1.5 text-xs" : "py-2 text-sm",
            o === value ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

function Empty({ text = "No wears logged in this period." }: { text?: string }) {
  return <p className="py-2 text-sm text-muted-foreground">{text}</p>;
}
