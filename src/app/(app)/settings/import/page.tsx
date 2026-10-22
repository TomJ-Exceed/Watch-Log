import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { listAllWear, listDealers, listOccasions, listStraps } from "@/lib/core/queries";
import type { Watch } from "@/lib/core/database.types";
import { ImportPanel } from "@/components/import/import-panel";

export default async function ImportPage() {
  const { supabase } = await requireUser();
  const [watches, dealers, straps, occasions, wear] = await Promise.all([
    supabase.from("watches").select("id, brand, model, reference").then((r) => (r.data ?? []) as Pick<Watch, "id" | "brand" | "model" | "reference">[]),
    listDealers(supabase),
    listStraps(supabase),
    listOccasions(supabase),
    listAllWear(supabase),
  ]);
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <Link href="/settings" className="-ml-2 p-2 text-muted-foreground" aria-label="Back"><ChevronLeft className="size-5" /></Link>
        <h1 className="text-xl font-semibold">Import from CSV</h1>
      </header>
      <ImportPanel
        watches={watches}
        dealers={dealers}
        straps={straps}
        occasions={occasions}
        wear={wear.map((w) => ({ date: w.date, watch_id: w.watch_id }))}
      />
    </div>
  );
}
