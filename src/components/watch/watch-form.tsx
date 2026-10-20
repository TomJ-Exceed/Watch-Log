"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Dealer, DealerType, Strap, Watch, WatchPhoto, WatchStatus, WatchType } from "@/lib/core/database.types";
import { DEALER_TYPE_LABEL, STATUS_LABEL } from "@/lib/core/format";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { deletePhoto, setPrimaryPhoto, uploadPhotos } from "./photo-actions";
import { cn } from "@/lib/utils";
import { CATALOG_BRANDS, catalogFor } from "@/lib/catalog";

type PhotoWithUrl = WatchPhoto & { url: string | null };
type Props = {
  userId: string;
  watch?: Watch;
  photos?: PhotoWithUrl[];
  dealers: Dealer[];
  straps: Strap[];
  brands: string[];
};

const FACTORIES = ["Clean", "VSF", "ZF", "APS", "BT", "EW", "GM", "3K", "AET", "ARF", "C+", "JVS", "KF", "N", "Noob", "PPF", "QF", "RE", "TW", "YL"];

type Form = Record<string, string | boolean>;
const str = (v: unknown) => (v == null ? "" : String(v));

function initial(w?: Watch): Form {
  return {
    brand: str(w?.brand), model: str(w?.model), reference: str(w?.reference), dial_color: str(w?.dial_color),
    case_size_mm: str(w?.case_size_mm), case_material: str(w?.case_material), movement: str(w?.movement),
    type: w?.type ?? "genuine", factory: str(w?.factory), factory_version: str(w?.factory_version),
    strap_id: str(w?.strap_id), condition: str(w?.condition), serial: str(w?.serial), notes: str(w?.notes),
    is_favorite: w?.is_favorite ?? false, dealer_id: str(w?.dealer_id), purchase_date: str(w?.purchase_date),
    purchase_price: str(w?.purchase_price), currency: w?.currency ?? "USD", gen_retail_price: str(w?.gen_retail_price),
    status: w?.status ?? "owned", sale_date: str(w?.sale_date), sale_price: str(w?.sale_price),
  };
}

export function WatchForm({ userId, watch, photos = [], dealers: initialDealers, straps: initialStraps, brands }: Props) {
  const router = useRouter();
  const [f, setF] = useState<Form>(() => initial(watch));
  const [dealers, setDealers] = useState(initialDealers);
  const [straps, setStraps] = useState(initialStraps);
  const [existing, setExisting] = useState(photos);
  const [pending, setPending] = useState<{ file: File; preview: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [newDealer, setNewDealer] = useState<{ name: string; type: DealerType | "" } | null>(null);
  const [newStrap, setNewStrap] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const isRep = f.type === "replica";
  const allBrands = [...new Set([...CATALOG_BRANDS, ...brands])].sort((a, b) => a.localeCompare(b));
  const refs = catalogFor(str(f.brand));
  const models = [...new Set(refs.map((r) => r.model))];
  const sold = f.status === "sold" || f.status === "traded";

  async function addDealer() {
    if (!newDealer?.name.trim()) return;
    const { data, error } = await supabaseBrowser()
      .from("dealers")
      .insert({ name: newDealer.name.trim(), type: newDealer.type || null })
      .select()
      .single();
    if (error) return setError(error.message);
    setDealers((d) => [...d, data].sort((a, b) => a.name.localeCompare(b.name)));
    setF((p) => ({ ...p, dealer_id: data.id }));
    setNewDealer(null);
  }

  async function addStrap() {
    if (!newStrap?.trim()) return;
    const { data, error } = await supabaseBrowser().from("straps").insert({ name: newStrap.trim() }).select().single();
    if (error) return setError(error.message);
    setStraps((s) => [...s, data].sort((a, b) => a.name.localeCompare(b.name)));
    setF((p) => ({ ...p, strap_id: data.id }));
    setNewStrap(null);
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPending((p) => [...p, ...files.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    e.target.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const num = (k: string) => (str(f[k]).trim() === "" ? null : Number(f[k]));
    const txt = (k: string) => str(f[k]).trim() || null;
    const row = {
      brand: str(f.brand).trim(),
      model: str(f.model).trim(),
      reference: txt("reference"),
      dial_color: txt("dial_color"),
      case_size_mm: num("case_size_mm"),
      case_material: txt("case_material"),
      movement: txt("movement"),
      type: f.type as WatchType,
      factory: isRep ? txt("factory") : null,
      factory_version: isRep ? txt("factory_version") : null,
      strap_id: txt("strap_id"),
      condition: txt("condition"),
      serial: txt("serial"),
      notes: txt("notes"),
      is_favorite: Boolean(f.is_favorite),
      dealer_id: txt("dealer_id"),
      purchase_date: txt("purchase_date"),
      purchase_price: num("purchase_price"),
      currency: str(f.currency) || "USD",
      gen_retail_price: num("gen_retail_price"),
      status: f.status as WatchStatus,
      sale_date: sold ? txt("sale_date") : null,
      sale_price: sold ? num("sale_price") : null,
    };
    try {
      const sb = supabaseBrowser();
      let id = watch?.id;
      if (id) {
        const { error } = await sb.from("watches").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("watches").insert(row).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      if (pending.length) {
        const hasPrimary = existing.some((p) => p.is_primary);
        await uploadPhotos(userId, id!, pending.map((p) => p.file), existing.length, !hasPrimary);
      }
      router.replace(`/watch/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function makePrimary(p: PhotoWithUrl) {
    await setPrimaryPhoto(p.watch_id, p.id);
    setExisting((list) => list.map((x) => ({ ...x, is_primary: x.id === p.id })));
  }
  async function removePhoto(p: PhotoWithUrl) {
    if (!confirm("Delete this photo?")) return;
    await deletePhoto(p);
    setExisting((list) => list.filter((x) => x.id !== p.id));
  }

  return (
    <form onSubmit={submit} className="space-y-6 pb-24">
      {/* PHOTOS */}
      <section className="space-y-2">
        <Label>Photos</Label>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex size-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border text-xs text-muted-foreground"
          >
            <Camera className="size-5" /> Add
          </button>
          {existing.map((p) => (
            <div key={p.id} className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-secondary">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.url && <img src={p.url} alt="" className="size-full object-cover" />}
              <button type="button" onClick={() => makePrimary(p)} className="absolute left-1 top-1 rounded-full bg-black/60 p-1" aria-label="Make primary">
                <Star className={cn("size-3.5", p.is_primary ? "fill-primary text-primary" : "text-white")} />
              </button>
              <button type="button" onClick={() => removePhoto(p)} className="absolute right-1 top-1 rounded-full bg-black/60 p-1" aria-label="Delete photo">
                <Trash2 className="size-3.5 text-white" />
              </button>
            </div>
          ))}
          {pending.map((p, i) => (
            <div key={p.preview} className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-secondary">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="size-full object-cover opacity-80" />
              <button type="button" onClick={() => setPending((l) => l.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/60 p-1" aria-label="Remove">
                <Trash2 className="size-3.5 text-white" />
              </button>
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">new</span>
            </div>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
        <p className="text-xs text-muted-foreground">Tap ★ to choose the cover photo. Photos are resized before upload.</p>
      </section>

      {/* TYPE */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-secondary p-1">
        {(["genuine", "replica"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setF((p) => ({ ...p, type: t }))}
            className={cn("h-10 rounded-xl text-sm font-medium", f.type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            {t === "genuine" ? "Genuine" : "Replica"}
          </button>
        ))}
      </div>

      <Section title="Watch">
        <Field label="Brand *">
          <Input required list="brands" value={str(f.brand)} onChange={set("brand")} placeholder="Rolex" />
          <datalist id="brands">{allBrands.map((b) => <option key={b} value={b} />)}</datalist>
        </Field>
        <Field label="Model *">
          <Input
            required
            list="models"
            value={str(f.model)}
            onChange={(e) => {
              const model = e.target.value;
              const hit = refs.filter((r) => r.model === model);
              setF((p) => ({ ...p, model, ...(hit.length === 1 && !str(p.reference) ? { reference: hit[0].reference } : {}) }));
            }}
            placeholder="Submariner Date"
          />
          <datalist id="models">{models.map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
        <Field label="Reference">
          <Input
            list="references"
            value={str(f.reference)}
            onChange={(e) => {
              const reference = e.target.value;
              const hit = refs.find((r) => r.reference === reference);
              setF((p) => ({ ...p, reference, ...(hit && !str(p.model) ? { model: hit.model } : {}) }));
            }}
            placeholder="126610LN"
          />
          <datalist id="references">
            {refs
              .filter((r) => !str(f.model) || r.model === str(f.model) || !models.includes(str(f.model)))
              .map((r) => <option key={r.reference} value={r.reference} label={r.model} />)}
          </datalist>
        </Field>
        {isRep && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Factory">
              <Input list="factories" value={str(f.factory)} onChange={set("factory")} placeholder="Clean" />
              <datalist id="factories">{FACTORIES.map((x) => <option key={x} value={x} />)}</datalist>
            </Field>
            <Field label="Version / notes"><Input value={str(f.factory_version)} onChange={set("factory_version")} placeholder="V4" /></Field>
          </div>
        )}
      </Section>

      <Section title="Specs">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dial"><Input value={str(f.dial_color)} onChange={set("dial_color")} placeholder="Black" /></Field>
          <Field label="Case (mm)"><Input inputMode="decimal" value={str(f.case_size_mm)} onChange={set("case_size_mm")} placeholder="41" /></Field>
          <Field label="Case material"><Input value={str(f.case_material)} onChange={set("case_material")} placeholder="Steel" /></Field>
          <Field label="Movement"><Input value={str(f.movement)} onChange={set("movement")} placeholder="3235" /></Field>
        </div>
      </Section>

      <Section title="Purchase">
        <Field label="Dealer">
          {newDealer ? (
            <div className="space-y-2 rounded-2xl border border-border p-3">
              <Input autoFocus value={newDealer.name} onChange={(e) => setNewDealer({ ...newDealer, name: e.target.value })} placeholder="Dealer name" />
              <NativeSelect value={newDealer.type} onChange={(e) => setNewDealer({ ...newDealer, type: e.target.value as DealerType | "" })}>
                <option value="">Type…</option>
                {Object.entries(DEALER_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={addDealer}>Add dealer</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setNewDealer(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <NativeSelect
              value={str(f.dealer_id)}
              onChange={(e) => (e.target.value === "__new" ? setNewDealer({ name: "", type: isRep ? "rep_dealer" : "" }) : set("dealer_id")(e))}
            >
              <option value="">None</option>
              {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              <option value="__new">+ Add new dealer…</option>
            </NativeSelect>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase date"><Input type="date" value={str(f.purchase_date)} onChange={set("purchase_date")} /></Field>
          <Field label="Price paid">
            <div className="flex gap-1.5">
              <Input inputMode="decimal" value={str(f.purchase_price)} onChange={set("purchase_price")} placeholder="0" />
              <NativeSelect value={str(f.currency)} onChange={set("currency")} className="w-20 px-2">
                {["USD", "EUR", "GBP", "CAD", "CHF", "HKD", "JPY"].map((c) => <option key={c}>{c}</option>)}
              </NativeSelect>
            </div>
          </Field>
        </div>
        <Field label={isRep ? "Genuine retail price" : "Current MSRP / market"}>
          <Input inputMode="decimal" value={str(f.gen_retail_price)} onChange={set("gen_retail_price")} placeholder="0" />
        </Field>
      </Section>

      <Section title="Status">
        <NativeSelect value={str(f.status)} onChange={set("status")}>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
        {sold && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={f.status === "sold" ? "Sale date" : "Trade date"}><Input type="date" value={str(f.sale_date)} onChange={set("sale_date")} /></Field>
            <Field label={f.status === "sold" ? "Sale price" : "Trade value"}><Input inputMode="decimal" value={str(f.sale_price)} onChange={set("sale_price")} /></Field>
          </div>
        )}
      </Section>

      <Section title="Details">
        <Field label="Current strap">
          {newStrap !== null ? (
            <div className="flex gap-2">
              <Input autoFocus value={newStrap} onChange={(e) => setNewStrap(e.target.value)} placeholder="e.g. Tan suede" />
              <Button type="button" size="sm" className="h-11" onClick={addStrap}>Add</Button>
              <Button type="button" size="sm" variant="ghost" className="h-11" onClick={() => setNewStrap(null)}>✕</Button>
            </div>
          ) : (
            <NativeSelect value={str(f.strap_id)} onChange={(e) => (e.target.value === "__new" ? setNewStrap("") : set("strap_id")(e))}>
              <option value="">None / bracelet</option>
              {straps.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="__new">+ Add new strap…</option>
            </NativeSelect>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Condition"><Input value={str(f.condition)} onChange={set("condition")} placeholder="Excellent" /></Field>
          <Field label="Serial"><Input value={str(f.serial)} onChange={set("serial")} placeholder="Optional" /></Field>
        </div>
        <Field label="Notes"><Textarea value={str(f.notes)} onChange={set("notes")} /></Field>
        <label className="flex items-center gap-3 rounded-2xl border border-border p-3">
          <input type="checkbox" checked={Boolean(f.is_favorite)} onChange={(e) => setF((p) => ({ ...p, is_favorite: e.target.checked }))} className="size-5 accent-[var(--primary)]" />
          <span className="text-sm">Favorite (shows first when picking)</span>
        </label>
      </Section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.75rem)] z-30">
        <div className="mx-auto max-w-lg px-4 pb-2">
          <Button type="submit" size="lg" className="h-12 w-full shadow-xl" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} {watch ? "Save changes" : "Add watch"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
