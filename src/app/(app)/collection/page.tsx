import Link from "next/link";
import { Plus, Settings } from "lucide-react";
import { getToday, requireUser } from "@/lib/supabase/server";
import { listDealers, listWatchCards } from "@/lib/core/queries";
import { CollectionGrid } from "@/components/collection/collection-grid";
import { Button } from "@/components/ui/button";

export default async function CollectionPage() {
  const { supabase } = await requireUser();
  const [cards, dealers, today] = await Promise.all([listWatchCards(supabase), listDealers(supabase), getToday()]);
  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Collection</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">
            {cards.filter((c) => c.status === "owned").length} watches
          </h1>
        </div>
        <div className="flex gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Settings">
            <Link href="/settings"><Settings /></Link>
          </Button>
          <Button asChild size="icon" aria-label="Add watch">
            <Link href="/watch/new"><Plus /></Link>
          </Button>
        </div>
      </header>
      <CollectionGrid cards={cards} dealers={dealers} today={today} />
    </div>
  );
}
