import { notFound, redirect } from "next/navigation";
import { getToday } from "@/lib/supabase/server";
import { loadDay } from "@/lib/server/load-day";
import { WristCheck } from "@/components/today/wrist-check";

export default async function DayPage({ params }: PageProps<"/day/[date]">) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) notFound();
  const today = await getToday();
  if (date === today) redirect("/");
  if (date > today) redirect("/");
  const data = await loadDay(date);
  return <WristCheck key={date} date={date} today={today} {...data} />;
}
