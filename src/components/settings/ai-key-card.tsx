"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Lets a user add/replace/remove their own Gemini API key for "Identify from photo". */
export function AiKeyCard({ hint }: { hint: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!hint);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/ai-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res?.ok) return setError(json?.error ?? "Couldn't save the key.");
    setKey("");
    setEditing(false);
    setSaved(true);
    router.refresh();
  }

  async function remove() {
    if (!confirm("Remove your Gemini key? Identify from photo will be turned off.")) return;
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("clear_gemini_key");
    setBusy(false);
    if (error) return setError(error.message);
    setEditing(true);
    setSaved(false);
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-3xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="flex-1">
          <p className="font-medium">AI watch identification</p>
          <p className="text-xs text-muted-foreground">
            Snap a photo when adding a watch and Gemini suggests the brand, model and reference. Uses your own free Google Gemini API key — typically a fraction of a cent per photo.
          </p>
        </div>
      </div>

      {hint && !editing ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-background px-4 py-3 text-sm">
          <span>
            <span className="text-primary">On</span> · key ending <span className="font-mono">…{hint}</span>
            {saved && <span className="ml-2 text-xs text-muted-foreground">Saved</span>}
          </span>
          <span className="flex gap-3 text-xs">
            <button type="button" onClick={() => setEditing(true)} className="text-muted-foreground">Replace</button>
            <button type="button" onClick={remove} disabled={busy} className="text-destructive">Remove</button>
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              Open{" "}
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary">
                Google AI Studio <ExternalLink className="size-3" />
              </a>{" "}
              and sign in with a Google account
            </li>
            <li>Tap <b>Create API key</b> and copy it</li>
            <li>Paste it below — it&apos;s checked with Google, stored encrypted, and never shown again</li>
          </ol>
          <div className="flex gap-2">
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste Gemini API key"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="font-mono text-sm"
            />
            <Button type="button" className="h-11" disabled={busy || key.trim().length < 20} onClick={save}>
              {busy ? <Loader2 className="animate-spin" /> : "Save"}
            </Button>
          </div>
          {hint && (
            <button type="button" onClick={() => { setEditing(false); setError(undefined); }} className="text-xs text-muted-foreground">Cancel</button>
          )}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
