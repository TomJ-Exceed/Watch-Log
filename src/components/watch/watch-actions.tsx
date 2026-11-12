"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Star, Tag, Trash2, Zap } from "lucide-react";
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

/** Opens the shortcut setup screen for a one-tap "wear this watch today" home-screen icon. */
export function QuickLinkButton({ watchId }: { watchId: string }) {
  return (
    <Link href={`/quick?w=${watchId}&setup=1`} className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left text-sm">
      <Zap className="size-4 shrink-0 text-primary" />
      <span className="flex-1">
        Add a one-tap shortcut
        <span className="block text-xs text-muted-foreground">A home-screen icon that logs this watch for today</span>
      </span>
    </Link>
  );
}

/** Pre-formatted sale listing with a one-tap copy button. */
export function SaleListing({ text, editHref, missingPrice }: { text: string; editHref: string; missingPrice: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers that block the async clipboard API.
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    navigator.vibrate?.(15);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <section className="space-y-3 rounded-3xl border border-primary/40 bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium"><Tag className="size-4 text-primary" /> Sale listing</h2>
        <Link href={editHref} className="text-xs text-muted-foreground">Edit price</Link>
      </div>
      <pre className="whitespace-pre-wrap rounded-2xl bg-background px-4 py-3 font-sans text-sm leading-relaxed">{text}</pre>
      {missingPrice && <p className="text-xs text-muted-foreground">Add an asking price to include it in the listing.</p>}
      <Button className="w-full" onClick={copy}>
        {copied ? <><Check /> Copied</> : <><Copy /> Copy listing</>}
      </Button>
    </section>
  );
}
