import { getToday, requireUser } from "@/lib/supabase/server";
import { listAllWear, listDealers, listOccasions, listStraps, listWatchCards } from "@/lib/core/queries";
import { StatsDashboard } from "@/components/stats/stats-dashboard";

export default async function StatsPage() {
  const { supabase } = await requireUser();
  const [cards, occasions, dealers, straps, wear, today] = await Promise.all([
    listWatchCards(supabase),
    listOccasions(supabase),
    listDealers(supabase),
    listStraps(supabase),
    listAllWear(supabase),
    getToday(),
  ]);

  return <StatsDashboard cards={cards} wear={wear} occasions={occasions} dealers={dealers} straps={straps} today={today} />;
}
