import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { listOccasions, listStraps, listWatchCards, listWearRange } from "@/lib/core/queries";
import { weekDays } from "@/lib/core/dates";

export async function loadDay(date: string) {
  const { supabase } = await requireUser();
  const week = weekDays(date);
  const [cards, occasions, straps, weekLogs] = await Promise.all([
    listWatchCards(supabase),
    listOccasions(supabase),
    listStraps(supabase),
    listWearRange(supabase, week[0], week[6]),
  ]);
  return { cards, occasions, straps, weekLogs, week };
}
