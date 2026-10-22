"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Undo2, Zap } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { WearLog } from "@/lib/core/database.types";
import type { WatchCard } from "@/lib/core/queries";
import { fmt } from "@/lib/core/dates";
import { watchName } from "@/lib/core/format";
import { WatchThumb } from "@/components/watch-thumb";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  today: string;
  cards: WatchCard[];
  todayLogs: WearLog[];
  occasionId: string | null;
  occasionName: string | null;
  autoWatchId: string | null;
  setup?: boolean;
};

type Logged = { entryId: string | null; watch: WatchCard; existed: boolean };

export function QuickLog({ today, cards, todayLogs, occasionId, occasionName, autoWatchId, setup }: Props) {
  const router = useRouter();
  const [logged, setLogged] = useState<Logged | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [undone, setUndone] = useState(false);
  const fired = useRef(false);
  const wornToday = new Set(todayLogs.map((l) => l.watch_id));

  async function log(watch: WatchCard) {
    setError(undefined);
    setUndone(false);
    const existing = todayLogs.find((l) => l.watch_id === watch.id);
    if (existing) return setLogged({ entryId: existing.id, watch, existed: true });
    setBusyId(watch.id);
    const { data, error } = await supabaseBrowser()
      .from("wear_log")
      .insert({ date: today, watch_id: watch.id, occasion_id: occasionId, strap_id: watch.strap_id })
      .select("id")
      .single();
    setBusyId(null);
    if (error) return setError(error.message);
    navigator.vibrate?.(20);
    setLogged({ entryId: data.id, watch, existed: false });
    router.refresh();
  }

  async function undo() {
    if (!logged?.entryId || logged.existed) return;
    const { error } = await supabaseBrowser().from("wear_log").delete().eq("id", logged.entryId);
    if (error) return setError(error.message);
    setUndone(true);
    router.refresh();
  }

  // Setup mode: strip ?setup=1 so "Add to Home Screen" saves the logging URL, but don't log now.
  useEffect(() => {
    if (setup && autoWatchId) history.replaceState(history.state, "", `/quick?w=${autoWatchId}`);
  }, [setup, autoWatchId]);

  // Shortcut link: log the requested watch as soon as the page opens (once).
  useEffect(() => {
    if (setup || !autoWatchId || fired.current) return;
    fired.current = true;
    const watch = cards.find((c) => c.id === autoWatchId);
    if (watch) void Promise.resolve().then(() => log(watch));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoWatchId]);

  if (setup && autoWatchId) {
    const w = cards.find((c) => c.id === autoWatchId);
    if (!w) return <p className="py-10 text-center text-sm text-muted-foreground">That watch isn&apos;t in your owned collection.</p>;
    return <ShortcutSetup watch={w} />;
  }

  if (autoWatchId && !cards.some((c) => c.id === autoWatchId)) {
    return <p className="py-10 text-center text-sm text-muted-foreground">That watch isn&apos;t in your owned collection anymore. <Link href="/quick" className="text-primary">Quick log</Link></p>;
  }

  if (autoWatchId && !logged && !error) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (logged) {
    const w = logged.watch;
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
        <div className="relative">
          <WatchThumb url={w.photo_url} alt={watchName(w)} className="size-44 rounded-[2rem]" />
          {!undone && (
            <span className="absolute -bottom-3 -right-3 grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <Check className="size-6" strokeWidth={2.5} />
            </span>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">{fmt(today, "EEEE, MMM d")}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{undone ? "Removed" : logged.existed ? "Already on the wrist" : "Logged"}</h1>
          <p className="text-secondary-foreground">{watchName(w)}</p>
          {!undone && !logged.existed && occasionName && <p className="text-xs text-muted-foreground">{occasionName}</p>}
        </div>
        <div className="flex w-full max-w-xs flex-col gap-2">
          {!undone && !logged.existed && (
            <Button variant="secondary" onClick={undo}><Undo2 /> Undo</Button>
          )}
          <Button asChild variant="secondary"><Link href="/">{undone || logged.existed ? "Open Today" : "Change occasion or add a note"}</Link></Button>
          <Button variant="ghost" onClick={() => { setLogged(null); setUndone(false); router.replace("/quick"); }}>Log a different watch</Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.2em] text-primary">
          <Zap className="size-3.5" /> Quick log
        </p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight">{fmt(today, "EEEE, MMM d")}</h1>
        <p className="text-sm text-muted-foreground">Tap a watch to log it{occasionName ? ` as ${occasionName}` : ""}.</p>
      </header>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">No owned watches yet. <Link href="/watch/new" className="text-primary">Add one</Link>.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          {cards.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={busyId !== null}
              onClick={() => log(c)}
              className="group relative text-left active:scale-[0.97] transition-transform"
            >
              <WatchThumb url={c.photo_url} alt={watchName(c)} className={cn("w-full", wornToday.has(c.id) && "ring-2 ring-primary")} />
              {busyId === c.id && (
                <span className="absolute inset-0 grid aspect-square place-items-center rounded-2xl bg-black/50">
                  <Loader2 className="size-5 animate-spin text-primary" />
                </span>
              )}
              {wornToday.has(c.id) && (
                <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{c.brand}</p>
              <p className="-mt-0.5 truncate text-xs">{c.model}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ShortcutSetup({ watch }: { watch: WatchCard }) {
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <WatchThumb url={watch.photo_url} alt="" className="size-16 shrink-0 rounded-2xl" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.2em] text-primary"><Zap className="size-3.5" /> One-tap shortcut</p>
          <h1 className="truncate text-xl font-semibold">{watchName(watch)}</h1>
        </div>
      </header>
      <p className="text-sm text-secondary-foreground">Save this page to your home screen. Tapping the icon opens Wrist Check and logs this watch for today — no other taps. If it&apos;s already logged, it just shows it.</p>
      <ol className="space-y-3 rounded-3xl bg-card p-5 text-sm">
        <li className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Android (Chrome)</li>
        <Step n={1}>Tap the <b>⋮</b> menu</Step>
        <Step n={2}>Choose <b>Add to Home screen</b> → <b>Create shortcut</b></Step>
        <Step n={3}>Keep or edit the name (“{watch.model}”), then tap <b>Add</b></Step>
        <li className="pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">iPhone (Safari)</li>
        <Step n={1}>Tap <b>Share</b> → <b>Add to Home Screen</b> → <b>Add</b></Step>
      </ol>
      <p className="text-xs text-muted-foreground">Using the installed app? Open this page in your browser to add the shortcut. You can also long-press the Wrist Check icon and pick <b>Quick log</b>.</p>
      <Button asChild variant="secondary" className="w-full"><Link href={`/watch/${watch.id}`}>Done</Link></Button>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
