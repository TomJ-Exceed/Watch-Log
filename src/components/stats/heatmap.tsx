"use client";
import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import type { WearRow } from "@/lib/core/analytics";
import { wearsByDay } from "@/lib/core/analytics";
import { fmt, shiftDate, weekDays } from "@/lib/core/dates";
import { cn } from "@/lib/utils";

const LEVEL = ["bg-secondary", "bg-primary/35", "bg-primary/65", "bg-primary"];

/** GitHub-style grid: one column per week (Mon–Sun), last ~12 months, scrolled to today. */
export function Heatmap({ wear, today }: { wear: WearRow[]; today: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => wearsByDay(wear), [wear]);
  const weeks = useMemo(() => {
    const out: string[][] = [];
    let monday = weekDays(shiftDate(today, -364))[0];
    while (monday <= today) {
      out.push(weekDays(monday));
      monday = shiftDate(monday, 7);
    }
    return out;
  }, [today]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <div className="space-y-2">
      <div ref={scroller} className="overflow-x-auto pb-1 [scrollbar-width:none]">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-[3px] pl-0 text-[10px] text-muted-foreground">
            {weeks.map((w, i) => {
              const first = w.find((d) => d.endsWith("-01"));
              return (
                <span key={w[0]} className="w-3 shrink-0 overflow-visible whitespace-nowrap">
                  {first && i < weeks.length - 1 ? fmt(first, "MMM") : ""}
                </span>
              );
            })}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((w) => (
              <div key={w[0]} className="flex flex-col gap-[3px]">
                {w.map((d) => {
                  const n = counts.get(d) ?? 0;
                  if (d > today) return <span key={d} className="size-3" />;
                  return (
                    <Link
                      key={d}
                      href={`/day/${d}`}
                      title={`${fmt(d, "EEE MMM d")}: ${n} ${n === 1 ? "wear" : "wears"}`}
                      className={cn("size-3 rounded-[3px]", LEVEL[Math.min(n, 3)], d === today && "ring-1 ring-foreground/60")}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
        Less
        {LEVEL.map((c) => <span key={c} className={cn("size-2.5 rounded-[2px]", c)} />)}
        More
      </div>
    </div>
  );
}
