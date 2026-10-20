import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { listDealers, listOccasions, listStraps } from "@/lib/core/queries";
import { AccountSection, DealersManager, OccasionsManager, SampleDataButton, StrapsManager } from "@/components/settings/managers";

export default async function SettingsPage() {
  const { supabase } = await requireUser();
  const [occasions, dealers, straps, sample, user] = await Promise.all([
    listOccasions(supabase),
    listDealers(supabase),
    listStraps(supabase),
    supabase.from("watches").select("id", { count: "exact", head: true }).like("notes", "[sample]%"),
    supabase.auth.getUser(),
  ]);
  return (
    <div className="space-y-8">
      <header className="flex items-center gap-2">
        <Link href="/collection" className="-ml-2 p-2 text-muted-foreground" aria-label="Back"><ChevronLeft className="size-5" /></Link>
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>
      {(sample.count ?? 0) > 0 && <SampleDataButton count={sample.count ?? 0} />}
      <OccasionsManager occasions={occasions} />
      <DealersManager dealers={dealers} />
      <StrapsManager straps={straps} />
      <AccountSection email={user.data.user?.email ?? ""} />
    </div>
  );
}
