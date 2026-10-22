"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Download, FileUp, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Dealer, Occasion, Strap, Watch } from "@/lib/core/database.types";
import {
  type RowResult, type WatchDraft, type WearDraft, WATCH_TEMPLATE, WEAR_TEMPLATE,
  isBlank, parseCSV, parseWatchRows, parseWearRows, resolveNames,
} from "@/lib/core/import";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Kind = "watches" | "wear";
type Props = {
  watches: Pick<Watch, "id" | "brand" | "model" | "reference">[];
  dealers: Dealer[];
  straps: Strap[];
  occasions: Occasion[];
  wear: { date: string; watch_id: string }[];
};
type Parsed =
  | { kind: "watches"; file: string; error: string | null; results: RowResult<WatchDraft>[] }
  | { kind: "wear"; file: string; error: string | null; results: RowResult<WearDraft>[] };

export function ImportPanel({ watches, dealers, straps, occasions, wear }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>("watches");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string>();
  const [error, setError] = useState<string>();

  async function onFile(f: File | undefined) {
    if (!f) return;
    setDone(undefined);
    setError(undefined);
    const rows = parseCSV(await f.text());
    if (rows.filter((r) => !isBlank(r)).length < 2) return setParsed({ kind, file: f.name, error: "The file has no data rows.", results: [] } as Parsed);
    setParsed(kind === "watches"
      ? { kind, file: f.name, ...parseWatchRows(rows, watches) }
      : { kind, file: f.name, ...parseWearRows(rows, watches, wear) });
  }

  const ready = parsed?.results.filter((r) => r.draft && !r.skip) ?? [];
  const skipped = parsed?.results.filter((r) => r.skip) ?? [];
  const bad = parsed?.results.filter((r) => r.errors.length) ?? [];

  // New dealers/straps/occasions that will be created alongside the import.
  const willCreate = (() => {
    if (!parsed || !ready.length) return [] as string[];
    if (parsed.kind === "watches") {
      const d = resolveNames(ready.map((r) => (r.draft as WatchDraft).dealer), dealers).missing;
      const s = resolveNames(ready.map((r) => (r.draft as WatchDraft).strap), straps).missing;
      return [...d.map((n) => `dealer “${n}”`), ...s.map((n) => `strap “${n}”`)];
    }
    const o = resolveNames(ready.map((r) => (r.draft as WearDraft).occasion), occasions).missing;
    const s = resolveNames(ready.map((r) => (r.draft as WearDraft).strap), straps).missing;
    return [...o.map((n) => `occasion “${n}”`), ...s.map((n) => `strap “${n}”`)];
  })();

  async function run() {
    if (!parsed || !ready.length) return;
    setBusy(true);
    setError(undefined);
    const sb = supabaseBrowser();
    try {
      // Create any missing lookup rows, returning name→id maps.
      async function ensure(table: "dealers" | "straps" | "occasions", names: (string | undefined)[], existing: (Dealer | Strap | Occasion)[]) {
        const { map, missing } = resolveNames(names, existing);
        if (missing.length) {
          const extra = table === "occasions" ? { is_special: false, sort_order: 100 } : {};
          const { data, error } = await sb.from(table).insert(missing.map((name) => ({ name, ...extra })) as never).select("id, name");
          if (error) throw new Error(`Couldn't create ${table}: ${error.message}`);
          for (const r of data ?? []) map.set(r.name.trim().toLowerCase(), r.id);
        }
        return (n?: string) => (n ? map.get(n.trim().toLowerCase()) ?? null : null);
      }

      let rows: Record<string, unknown>[];
      if (parsed.kind === "watches") {
        const drafts = ready.map((r) => r.draft as WatchDraft);
        const dealerId = await ensure("dealers", drafts.map((d) => d.dealer), dealers);
        const strapId = await ensure("straps", drafts.map((d) => d.strap), straps);
        rows = drafts.map(({ dealer, strap, ...w }) => ({ ...w, dealer_id: dealerId(dealer), strap_id: strapId(strap) }));
      } else {
        const drafts = ready.map((r) => r.draft as WearDraft);
        const occId = await ensure("occasions", drafts.map((d) => d.occasion), occasions);
        const strapId = await ensure("straps", drafts.map((d) => d.strap), straps);
        const fallback = occasions.find((o) => o.is_default)?.id ?? null;
        rows = drafts.map(({ occasion, strap, ...w }) => ({ ...w, occasion_id: occasion ? occId(occasion) : fallback, strap_id: strapId(strap) }));
      }

      const table = parsed.kind === "watches" ? "watches" : "wear_log";
      for (let i = 0; i < rows.length; i += 250) {
        const { error } = await sb.from(table).insert(rows.slice(i, i + 250) as never);
        if (error) throw new Error(`Stopped after ${i} rows: ${error.message}`);
      }
      setDone(`Imported ${rows.length} ${parsed.kind === "watches" ? (rows.length === 1 ? "watch" : "watches") : rows.length === 1 ? "wear entry" : "wear entries"}.`);
      setParsed(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-card p-1">
        {(["watches", "wear"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => { setKind(k); setParsed(null); setDone(undefined); setError(undefined); if (fileRef.current) fileRef.current.value = ""; }}
            className={cn("h-10 rounded-xl text-sm font-medium", kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            {k === "watches" ? "Watches" : "Wear log"}
          </button>
        ))}
      </div>

      <div className="space-y-2 text-sm text-muted-foreground">
        {kind === "watches" ? (
          <>
            <p>One row per watch. Required columns: <b className="text-foreground">brand</b> and <b className="text-foreground">model</b>. Everything else is optional — type (genuine/replica), status, reference, dealer, strap, prices, dates, notes…</p>
            <p>New dealers and straps are created automatically. Watches already in your collection (same brand, model and reference) are skipped.</p>
          </>
        ) : (
          <>
            <p>One row per wear. Required: <b className="text-foreground">date</b> and the watch — either a <b className="text-foreground">reference</b>, <b className="text-foreground">brand + model</b>, or a single <b className="text-foreground">watch</b> column like “Rolex Submariner Date”.</p>
            <p>Watches must already be in your collection, so import watches first. Days already logged for the same watch are skipped. New occasions and straps are created automatically; blank occasions use your default.</p>
          </>
        )}
        <p>Works with the app&apos;s own Export CSV. From Excel or Google Sheets, use File → Save as / Download → CSV. Dates as 2026-10-22 or 10/22/2026.</p>
        <button type="button" onClick={() => download(kind === "watches" ? "watches-template.csv" : "wear-log-template.csv", kind === "watches" ? WATCH_TEMPLATE : WEAR_TEMPLATE)} className="inline-flex items-center gap-1.5 text-primary">
          <Download className="size-3.5" /> Download a template
        </button>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-border bg-card px-4 py-8 text-center">
        <FileUp className="size-6 text-primary" />
        <span className="text-sm font-medium">{parsed?.file ?? "Choose a CSV file"}</span>
        <span className="text-xs text-muted-foreground">Nothing is saved until you confirm</span>
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>

      {done && (
        <div className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-primary" />
          <span className="flex-1">{done}</span>
          <Link href={kind === "watches" ? "/collection" : "/calendar"} className="text-primary">View</Link>
        </div>
      )}
      {error && <p className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</p>}

      {parsed && (
        <div className="space-y-4">
          {parsed.error ? (
            <p className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" />{parsed.error}</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat n={ready.length} label="to import" strong />
                <Stat n={skipped.length} label="duplicates" />
                <Stat n={bad.length} label="with problems" warn={bad.length > 0} />
              </div>

              {ready.length > 0 && (
                <div className="overflow-hidden rounded-2xl bg-card">
                  {ready.slice(0, 8).map((r) => (
                    <div key={r.line} className="flex justify-between gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0">
                      <span className="truncate">{describe(parsed.kind, r.draft!, watches)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">row {r.line}</span>
                    </div>
                  ))}
                  {ready.length > 8 && <p className="px-4 py-2.5 text-xs text-muted-foreground">…and {ready.length - 8} more</p>}
                </div>
              )}

              {willCreate.length > 0 && <p className="text-xs text-muted-foreground">Will also create: {willCreate.join(", ")}.</p>}

              {bad.length > 0 && (
                <details className="rounded-2xl bg-card px-4 py-3 text-sm" open={ready.length === 0}>
                  <summary className="cursor-pointer text-destructive">{bad.length} {bad.length === 1 ? "row" : "rows"} won&apos;t be imported</summary>
                  <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {bad.map((r) => <li key={r.line}>Row {r.line}: {r.errors.join("; ")}</li>)}
                  </ul>
                </details>
              )}

              <Button className="w-full" size="lg" disabled={!ready.length || busy} onClick={run}>
                {busy && <Loader2 className="animate-spin" />}
                {ready.length ? `Import ${ready.length} ${parsed.kind === "watches" ? (ready.length === 1 ? "watch" : "watches") : ready.length === 1 ? "entry" : "entries"}` : "Nothing to import"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function describe(kind: Kind, d: WatchDraft | WearDraft, watches: Props["watches"]) {
  if (kind === "watches") {
    const w = d as WatchDraft;
    return [w.brand, w.model, w.reference && `· ${w.reference}`, w.type === "replica" && "(rep)"].filter(Boolean).join(" ");
  }
  const w = d as WearDraft;
  const watch = watches.find((x) => x.id === w.watch_id);
  return `${w.date} · ${watch ? `${watch.brand} ${watch.model}` : ""}${w.occasion ? ` · ${w.occasion}` : ""}`;
}

function Stat({ n, label, strong, warn }: { n: number; label: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-2xl bg-card px-2 py-3">
      <p className={cn("text-xl font-semibold tabular", strong && "text-primary", warn && "text-destructive")}>{n}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
