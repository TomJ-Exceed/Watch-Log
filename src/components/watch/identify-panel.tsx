"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, ImageIcon, Loader2, Sparkles, X } from "lucide-react";
import type { IdentifyResult, WatchGuess } from "@/lib/core/identify";
import { compressImage } from "@/lib/image";
import { cn } from "@/lib/utils";

type Props = {
  enabled: boolean;
  /** First photo already on the form (pending file or saved photo URL), if any. */
  existingPhoto: { file?: File; url?: string | null } | null;
  /** Called with a newly picked photo so the form can keep it as a watch photo. */
  onNewPhoto: (file: File) => void;
  onPick: (guess: WatchGuess) => void;
};

const CONF_STYLE: Record<WatchGuess["confidence"], string> = {
  high: "bg-primary text-primary-foreground",
  medium: "bg-secondary text-secondary-foreground",
  low: "bg-secondary text-muted-foreground",
};

export function IdentifyPanel({ enabled, existingPhoto, onNewPhoto, onPick }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; settings?: boolean }>();
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  if (!enabled) {
    return (
      <Link href="/settings" className="flex items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
        <Sparkles className="size-4 text-primary" /> Identify from photo — add a Gemini key in Settings to turn on
      </Link>
    );
  }

  async function identify(source: Blob) {
    setBusy(true);
    setError(undefined);
    setResult(null);
    setPicked(null);
    try {
      const jpeg = await compressImage(source, 1024, 0.8);
      const image = await toBase64(jpeg);
      const res = await fetch("/api/identify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
      const json = await res.json().catch(() => ({ error: "Unexpected response. Try again." }));
      if (!res.ok) return setError({ text: json.error ?? "Couldn't identify the watch.", settings: json.code === "no_key" || json.code === "bad_key" });
      const r = json as IdentifyResult;
      if (!r.is_watch || !r.candidates.length) return setError({ text: r.note ?? "Couldn't spot a watch in that photo. Try a clear, front-on shot of the dial." });
      setResult(r);
    } catch {
      setError({ text: "Couldn't reach the server. Check your connection." });
    } finally {
      setBusy(false);
    }
  }

  async function useExisting() {
    if (existingPhoto?.file) return identify(existingPhoto.file);
    if (existingPhoto?.url) {
      setBusy(true);
      const blob = await fetch(existingPhoto.url).then((r) => r.blob()).catch(() => null);
      setBusy(false);
      if (!blob) return setError({ text: "Couldn't load that photo. Take a new one instead." });
      return identify(blob);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-primary/30 bg-card p-3">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          {busy ? "Identifying…" : "Identify from photo"}
        </button>
        {existingPhoto && (
          <button
            type="button"
            disabled={busy}
            onClick={useExisting}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-medium disabled:opacity-60"
          >
            <ImageIcon className="size-4" /> Use first photo
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          onNewPhoto(f);
          void identify(f);
        }}
      />

      {error && (
        <p className="text-sm text-destructive">
          {error.text} {error.settings && <Link href="/settings" className="underline">Open Settings</Link>}
        </p>
      )}

      {result && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tap a match to fill in</p>
            <button type="button" onClick={() => setResult(null)} aria-label="Dismiss" className="text-muted-foreground"><X className="size-4" /></button>
          </div>
          {result.candidates.map((c, i) => (
            <button
              key={`${c.brand}-${c.model}-${c.reference}-${i}`}
              type="button"
              onClick={() => { onPick(c); setPicked(i); }}
              className={cn("w-full rounded-xl border px-3 py-2.5 text-left transition-colors", picked === i ? "border-primary bg-primary/10" : "border-border bg-background")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.brand} {c.model}</p>
                  <p className="truncate text-xs text-secondary-foreground">
                    {[c.reference ?? "Reference unsure", c.dial_color && `${c.dial_color} dial`, c.case_size_mm && `${c.case_size_mm} mm`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {picked === i ? (
                  <Check className="size-4 shrink-0 text-primary" />
                ) : (
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", CONF_STYLE[c.confidence])}>{c.confidence}</span>
                )}
              </div>
              {c.reason && <p className="mt-1 text-[11px] text-muted-foreground">{c.reason}</p>}
            </button>
          ))}
          {result.note && <p className="text-[11px] text-muted-foreground">Tip: {result.note}</p>}
          <p className="text-[11px] text-muted-foreground">AI suggestions can be wrong — double-check the reference before saving.</p>
        </div>
      )}
    </div>
  );
}

function toBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
