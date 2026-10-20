"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Star, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PHOTO_BUCKET } from "@/lib/core/queries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FavoriteToggle({ watchId, initial }: { watchId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const router = useRouter();
  async function toggle() {
    setOn(!on);
    const { error } = await supabaseBrowser().from("watches").update({ is_favorite: !on }).eq("id", watchId);
    if (error) setOn(on);
    else router.refresh();
  }
  return (
    <Button variant="secondary" size="icon" onClick={toggle} aria-label="Favorite">
      <Star className={cn(on && "fill-primary text-primary")} />
    </Button>
  );
}

export function WearTodayButton({ watchId, today, occasionId, strapId, wornToday }: { watchId: string; today: string; occasionId?: string; strapId: string | null; wornToday: boolean }) {
  const router = useRouter();
  const [done, setDone] = useState(wornToday);
  const [busy, setBusy] = useState(false);
  async function wear() {
    setBusy(true);
    const { error } = await supabaseBrowser().from("wear_log").insert({ date: today, watch_id: watchId, occasion_id: occasionId ?? null, strap_id: strapId });
    setBusy(false);
    if (!error) {
      setDone(true);
      router.refresh();
    }
  }
  return (
    <Button className="flex-1" onClick={wear} disabled={done || busy}>
      <Check /> {done ? "On the wrist today" : "Wear today"}
    </Button>
  );
}

export function DeleteWatchButton({ watchId, photoPaths }: { watchId: string; photoPaths: string[] }) {
  const router = useRouter();
  async function del() {
    if (!confirm("Delete this watch and all its wear history? This can't be undone.")) return;
    const sb = supabaseBrowser();
    if (photoPaths.length) await sb.storage.from(PHOTO_BUCKET).remove(photoPaths);
    const { error } = await sb.from("watches").delete().eq("id", watchId);
    if (error) return alert(error.message);
    router.replace("/collection");
    router.refresh();
  }
  return (
    <Button variant="ghost" size="sm" onClick={del} className="text-destructive">
      <Trash2 /> Delete
    </Button>
  );
}
