import { getToday } from "@/lib/supabase/server";
import { loadDay } from "@/lib/server/load-day";
import { WristCheck } from "@/components/today/wrist-check";

export default async function TodayPage() {
  const today = await getToday();
  const data = await loadDay(today);
  return <WristCheck key={today} date={today} today={today} {...data} />;
}
