import type { Metadata } from "next";
import { getToday, requireUser } from "@/lib/supabase/server";
import { listOccasions, listWatchCards, listWearRange, pickerOrder } from "@/lib/core/queries";
import { QuickLog } from "@/components/quick/quick-log";

// /quick       → one-tap grid: tap a watch and it's logged for today.
// /quick?w=ID  → logs that watch immediately (bookmark / home-screen shortcut per watch).
export async function generateMetadata({ searchParams }: PageProps<"/quick">): Promise<Metadata> {
  const { w } = await searchParams;
  if (typeof w !== "string") return { title: "Quick log · Wrist Check" };
  const { supabase } = await requireUser();
  const { data } = await supabase.from("watches").select("brand, model").eq("id", w).maybeSingle();
  return { title: data ? `Wear ${data.model}` : "Quick log", appleWebApp: { title: data ? data.model : "Quick log" } };
}

export default async function QuickPage({ searchParams }: PageProps<"/quick">) {
  const { w, setup } = await searchParams;
  const { supabase } = await requireUser();
  const today = await getToday();
  const [cards, occasions, todayLogs] = await Promise.all([
    listWatchCards(supabase, { statuses: ["owned"] }),
    listOccasions(supabase),
    listWearRange(supabase, today, today),
  ]);
  const defaultOccasion = occasions.find((o) => o.is_default) ?? occasions[0] ?? null;
  return (
    <QuickLog
      key={`${today}-${typeof w === "string" ? w : ""}`}
      today={today}
      cards={pickerOrder(cards, today)}
      todayLogs={todayLogs}
      occasionId={defaultOccasion?.id ?? null}
      occasionName={defaultOccasion?.name ?? null}
      autoWatchId={typeof w === "string" ? w : null}
      setup={setup === "1"}
    />
  );
}
