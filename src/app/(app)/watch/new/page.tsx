import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { listDealers, listStraps } from "@/lib/core/queries";
import { WatchForm } from "@/components/watch/watch-form";

export default async function NewWatchPage() {
  const { supabase, userId } = await requireUser();
  const [dealers, straps, brandRows] = await Promise.all([
    listDealers(supabase),
    listStraps(supabase),
    supabase.from("watches").select("brand"),
  ]);
  const brands = [...new Set((brandRows.data ?? []).map((r) => r.brand))].sort();
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <Link href="/collection" className="-ml-2 p-2 text-muted-foreground" aria-label="Back"><ChevronLeft className="size-5" /></Link>
        <h1 className="text-xl font-semibold">Add watch</h1>
      </header>
      <WatchForm userId={userId} dealers={dealers} straps={straps} brands={brands} />
    </div>
  );
}
