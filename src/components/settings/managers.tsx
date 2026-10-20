"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Sparkles, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Dealer, DealerType, Occasion, Strap } from "@/lib/core/database.types";
import { deleteSampleData } from "@/lib/core/queries";
import { DEALER_TYPE_LABEL } from "@/lib/core/format";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(undefined);
    const { error } = await fn();
    if (error) setError(error.message);
    else router.refresh();
  }
  return { run, error };
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="divide-y divide-border rounded-3xl border border-border bg-card">{children}</div>
    </section>
  );
}

export function OccasionsManager({ occasions }: { occasions: Occasion[] }) {
  const { run, error } = useAction();
  const [name, setName] = useState("");
  const sb = supabaseBrowser();
  return (
    <Card title="Occasions" hint="★ = special occasion (asks what it was). Tap the check to make one the default.">
      {occasions.map((o) => (
        <div key={o.id} className="flex items-center gap-2 px-3 py-2">
          <button
            onClick={() => run(async () => {
              await sb.from("occasions").update({ is_default: false }).eq("is_default", true);
              return sb.from("occasions").update({ is_default: true }).eq("id", o.id);
            })}
            className={cn("flex size-7 items-center justify-center rounded-full border", o.is_default ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent")}
            aria-label="Make default"
          >
            <Check className="size-4" />
          </button>
          <Input
            defaultValue={o.name}
            className="h-9 flex-1 border-transparent bg-transparent px-1"
            onBlur={(e) => e.target.value.trim() && e.target.value !== o.name && run(() => sb.from("occasions").update({ name: e.target.value.trim() }).eq("id", o.id))}
          />
          <button
            onClick={() => run(() => sb.from("occasions").update({ is_special: !o.is_special }).eq("id", o.id))}
            className={cn("px-2 text-lg", o.is_special ? "text-primary" : "text-muted-foreground/40")}
            aria-label="Toggle special"
          >
            ★
          </button>
          {!o.is_default && (
            <button onClick={() => confirm(`Delete "${o.name}"?`) && run(() => sb.from("occasions").delete().eq("id", o.id))} className="p-1 text-muted-foreground" aria-label="Delete">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ))}
      <form
        className="flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(() => sb.from("occasions").insert({ name: name.trim(), sort_order: occasions.length }));
          setName("");
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New occasion" className="h-10" />
        <Button size="sm" className="h-10" type="submit"><Plus /> Add</Button>
      </form>
      {error && <p className="p-3 text-sm text-destructive">{error}</p>}
    </Card>
  );
}

export function DealersManager({ dealers }: { dealers: Dealer[] }) {
  const { run, error } = useAction();
  const sb = supabaseBrowser();
  const [draft, setDraft] = useState({ name: "", type: "" as DealerType | "" });
  return (
    <Card title="Dealers">
      {dealers.map((d) => (
        <div key={d.id} className="space-y-2 px-3 py-2">
          <div className="flex items-center gap-2">
            <Input
              defaultValue={d.name}
              className="h-9 flex-1 border-transparent bg-transparent px-1 font-medium"
              onBlur={(e) => e.target.value.trim() && e.target.value !== d.name && run(() => sb.from("dealers").update({ name: e.target.value.trim() }).eq("id", d.id))}
            />
            <NativeSelect
              value={d.type ?? ""}
              onChange={(e) => run(() => sb.from("dealers").update({ type: (e.target.value || null) as DealerType | null }).eq("id", d.id))}
              className="h-9 w-36 text-sm"
            >
              <option value="">Type…</option>
              {Object.entries(DEALER_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
            <button onClick={() => confirm(`Delete "${d.name}"? Watches keep their data but lose the dealer link.`) && run(() => sb.from("dealers").delete().eq("id", d.id))} className="p-1 text-muted-foreground" aria-label="Delete">
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input defaultValue={d.contact ?? ""} placeholder="Contact" className="h-9 text-sm" onBlur={(e) => e.target.value !== (d.contact ?? "") && run(() => sb.from("dealers").update({ contact: e.target.value || null }).eq("id", d.id))} />
            <Input defaultValue={d.website ?? ""} placeholder="Website" className="h-9 text-sm" onBlur={(e) => e.target.value !== (d.website ?? "") && run(() => sb.from("dealers").update({ website: e.target.value || null }).eq("id", d.id))} />
          </div>
        </div>
      ))}
      <form
        className="flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.name.trim()) return;
          run(() => sb.from("dealers").insert({ name: draft.name.trim(), type: draft.type || null }));
          setDraft({ name: "", type: "" });
        }}
      >
        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="New dealer" className="h-10" />
        <Button size="sm" className="h-10" type="submit"><Plus /> Add</Button>
      </form>
      {error && <p className="p-3 text-sm text-destructive">{error}</p>}
    </Card>
  );
}

export function StrapsManager({ straps }: { straps: Strap[] }) {
  const { run, error } = useAction();
  const sb = supabaseBrowser();
  const [name, setName] = useState("");
  const upd = (id: string, patch: Partial<Strap>) => run(() => sb.from("straps").update(patch).eq("id", id));
  return (
    <Card title="Straps">
      {straps.map((s) => (
        <div key={s.id} className="flex items-center gap-2 px-3 py-2">
          <Input defaultValue={s.name} className="h-9 flex-1 border-transparent bg-transparent px-1 font-medium" onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && upd(s.id, { name: e.target.value.trim() })} />
          <Input defaultValue={s.material ?? ""} placeholder="Material" className="h-9 w-24 text-sm" onBlur={(e) => e.target.value !== (s.material ?? "") && upd(s.id, { material: e.target.value || null })} />
          <Input defaultValue={s.width_mm ?? ""} inputMode="decimal" placeholder="mm" className="h-9 w-14 text-sm" onBlur={(e) => e.target.value !== String(s.width_mm ?? "") && upd(s.id, { width_mm: e.target.value ? Number(e.target.value) : null })} />
          <button onClick={() => confirm(`Delete "${s.name}"?`) && run(() => sb.from("straps").delete().eq("id", s.id))} className="p-1 text-muted-foreground" aria-label="Delete">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <form
        className="flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(() => sb.from("straps").insert({ name: name.trim() }));
          setName("");
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New strap" className="h-10" />
        <Button size="sm" className="h-10" type="submit"><Plus /> Add</Button>
      </form>
      {error && <p className="p-3 text-sm text-destructive">{error}</p>}
    </Card>
  );
}

export function SampleDataButton({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-primary/30 bg-primary/10 p-4">
      <Sparkles className="size-5 shrink-0 text-primary" />
      <p className="flex-1 text-sm">{count} sample watches with a week of wear are loaded so you can try things out.</p>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          if (!confirm("Remove all sample watches, straps, dealers and wear logs?")) return;
          setBusy(true);
          await deleteSampleData(supabaseBrowser());
          router.refresh();
        }}
      >
        Remove
      </Button>
    </div>
  );
}

export function AccountSection({ email }: { email: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string>();
  const sb = supabaseBrowser();
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Account</h2>
      <p className="text-sm text-muted-foreground">Signed in as {email}</p>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await sb.auth.updateUser({ password: pw });
          setMsg(error ? error.message : "Password updated.");
          setPw("");
        }}
      >
        <Input type="password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" autoComplete="new-password" className="h-10" />
        <Button size="sm" variant="secondary" className="h-10" type="submit" disabled={pw.length < 8}>Update</Button>
      </form>
      {msg && <p className="text-sm text-primary">{msg}</p>}
      <Button
        variant="outline"
        className="w-full"
        onClick={async () => {
          await sb.auth.signOut();
          router.replace("/login");
          router.refresh();
        }}
      >
        Sign out
      </Button>
    </section>
  );
}
