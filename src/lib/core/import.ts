// CSV import: parsing, column mapping and validation. Pure TS (no Supabase/React) so it can be
// unit-tested and reused. Accepts the app's own export format plus common column-name variants.
import type { Dealer, Occasion, Strap, Watch, WatchStatus, WatchType } from "./database.types";

// ---- CSV parsing -----------------------------------------------------------

/** RFC 4180-ish parser: quoted fields, escaped quotes, CRLF/LF, commas or semicolons/tabs. */
export function parseCSV(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].sort((a, b) => count(firstLine, b) - count(firstLine, a))[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  // drop trailing empty lines; interior blanks are kept so row numbers match the file
  while (rows.length && isBlank(rows[rows.length - 1])) rows.pop();
  return rows;
}
export const isBlank = (r: string[]) => r.every((f) => f.trim() === "");
const count = (s: string, ch: string) => s.split(ch).length - 1;

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Map each canonical field to the column index whose header matches one of its aliases. */
function mapHeaders(header: string[], aliases: Record<string, string[]>) {
  const cols = header.map(norm);
  const map: Record<string, number> = {};
  for (const [field, names] of Object.entries(aliases)) {
    const i = cols.findIndex((c) => names.includes(c));
    if (i >= 0) map[field] = i;
  }
  return map;
}

// ---- value parsing ---------------------------------------------------------

/** YYYY-MM-DD, M/D/YYYY, M/D/YY, or anything Date can read unambiguously. */
export function parseDateCell(v: string): string | null | undefined {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(y, +m[1], +m[2]); // US order: month/day/year
  }
  const d = new Date(s);
  return isNaN(+d) ? undefined : iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function iso(y: number, mo: number, d: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseMoney(v: string): number | null | undefined {
  const s = v.trim().replace(/[$€£,\s]/g, "").replace(/^USD|USD$/i, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const truthy = (v: string) => ["true", "yes", "y", "1", "x", "★", "fav", "favorite"].includes(v.trim().toLowerCase());

function parseType(v: string): WatchType | undefined {
  const s = v.trim().toLowerCase();
  if (!s || s.startsWith("gen") || s === "real" || s === "authentic") return "genuine";
  if (s.startsWith("rep") || s === "fake" || s === "homage") return "replica";
  return undefined;
}
function parseStatus(v: string): WatchStatus | undefined {
  const s = v.trim().toLowerCase();
  if (!s || s === "owned" || s === "own" || s === "in collection") return "owned";
  if (s === "sold") return "sold";
  if (s === "traded" || s === "trade") return "traded";
  if (s === "wishlist" || s === "wanted" || s === "want") return "wishlist";
  return undefined;
}

// ---- watches ---------------------------------------------------------------

const WATCH_ALIASES: Record<string, string[]> = {
  brand: ["brand", "make", "manufacturer"],
  model: ["model", "name", "watch model"],
  reference: ["reference", "ref", "reference number", "ref no", "ref number"],
  type: ["type", "gen rep", "genuine replica", "gen or rep", "authenticity"],
  status: ["status"],
  factory: ["factory"],
  factory_version: ["factory version", "version", "factory notes"],
  dial_color: ["dial", "dial color", "dial colour"],
  case_size_mm: ["case mm", "case size", "case size mm", "size", "size mm", "diameter"],
  case_material: ["case material", "material"],
  movement: ["movement", "calibre", "caliber"],
  dealer: ["dealer", "seller", "bought from", "source"],
  strap: ["strap", "bracelet"],
  purchase_date: ["purchase date", "date purchased", "bought", "purchased"],
  purchase_price: ["purchase price", "price", "price paid", "paid", "cost"],
  currency: ["currency"],
  gen_retail_price: ["gen retail price", "retail", "retail price", "msrp", "market value", "gen price", "genuine price"],
  sale_date: ["sale date", "date sold"],
  sale_price: ["sale price", "sold for"],
  is_favorite: ["favorite", "favourite", "is favorite", "fav"],
  condition: ["condition"],
  serial: ["serial", "serial number"],
  notes: ["notes", "note", "comments"],
};

export type WatchDraft = Omit<Partial<Watch>, "dealer_id" | "strap_id"> & { brand: string; model: string; dealer?: string; strap?: string };
export type RowResult<T> = { line: number; draft: T | null; errors: string[]; skip?: string };

export function parseWatchRows(rows: string[][], existing: Pick<Watch, "brand" | "model" | "reference">[]) {
  const [header, ...body] = rows;
  const col = mapHeaders(header ?? [], WATCH_ALIASES);
  const missing = ["brand", "model"].filter((f) => col[f] == null);
  if (missing.length) return { error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`, results: [] as RowResult<WatchDraft>[], columns: col };

  const key = (w: { brand?: string | null; model?: string | null; reference?: string | null }) =>
    [w.brand, w.model, w.reference].map((x) => (x ?? "").trim().toLowerCase()).join("|");
  const seen = new Set(existing.map(key));

  const results = body.map((r, i): RowResult<WatchDraft> | null => {
    if (isBlank(r)) return null;
    const get = (f: string) => (col[f] != null ? (r[col[f]] ?? "").trim() : "");
    const errors: string[] = [];
    const draft: WatchDraft = { brand: get("brand"), model: get("model") };
    if (!draft.brand) errors.push("brand is empty");
    if (!draft.model) errors.push("model is empty");
    const text = (f: keyof WatchDraft & string) => { const v = get(f); if (v) (draft as Record<string, unknown>)[f] = v; };
    (["reference", "factory", "factory_version", "dial_color", "case_material", "movement", "condition", "serial", "notes", "dealer", "strap"] as const).forEach(text);

    const type = parseType(get("type"));
    if (!type) errors.push(`type "${get("type")}" should be genuine or replica`);
    else draft.type = type;
    const status = parseStatus(get("status"));
    if (!status) errors.push(`status "${get("status")}" should be owned, sold, traded or wishlist`);
    else draft.status = status;
    if (draft.type !== "replica") { delete draft.factory; delete draft.factory_version; }

    for (const f of ["purchase_date", "sale_date"] as const) {
      const d = parseDateCell(get(f));
      if (d === undefined) errors.push(`${f.replace("_", " ")} "${get(f)}" isn't a date`);
      else if (d) draft[f] = d;
    }
    for (const f of ["purchase_price", "gen_retail_price", "sale_price", "case_size_mm"] as const) {
      const n = parseMoney(get(f));
      if (n === undefined) errors.push(`${f.replace(/_/g, " ")} "${get(f)}" isn't a number`);
      else if (n != null) draft[f] = n;
    }
    const cur = get("currency").toUpperCase();
    if (cur) draft.currency = cur.slice(0, 3);
    if (get("is_favorite")) draft.is_favorite = truthy(get("is_favorite"));

    let skip: string | undefined;
    if (!errors.length) {
      const k = key(draft);
      if (seen.has(k)) skip = "already in your collection";
      seen.add(k);
    }
    return { line: i + 2, draft: errors.length ? null : draft, errors, skip };
  }).filter((r): r is RowResult<WatchDraft> => r !== null);
  return { error: null, results, columns: col };
}

// ---- wear log --------------------------------------------------------------

const WEAR_ALIASES: Record<string, string[]> = {
  date: ["date", "day", "worn on", "wear date"],
  watch: ["watch", "watch name"],
  brand: ["brand", "make"],
  model: ["model"],
  reference: ["reference", "ref"],
  occasion: ["occasion", "reason", "why"],
  occasion_detail: ["occasion detail", "detail", "event"],
  strap: ["strap"],
  notes: ["notes", "note"],
};

export type WearDraft = { date: string; watch_id: string; occasion?: string; occasion_detail?: string; strap?: string; notes?: string };

type WatchLite = Pick<Watch, "id" | "brand" | "model" | "reference">;

/** Find a watch by reference, then brand+model, then a combined "Brand Model" name. */
export function matchWatch(watches: WatchLite[], q: { brand?: string; model?: string; reference?: string; watch?: string }) {
  const lc = (s?: string | null) => (s ?? "").trim().toLowerCase();
  const one = (xs: WatchLite[]) => (xs.length === 1 ? xs[0] : xs.length > 1 ? "ambiguous" : null);
  if (q.reference) {
    const byRef = watches.filter((w) => lc(w.reference) === lc(q.reference) && (!q.brand || lc(w.brand) === lc(q.brand)));
    const hit = one(byRef);
    if (hit) return hit;
  }
  if (q.brand && q.model) {
    const hit = one(watches.filter((w) => lc(w.brand) === lc(q.brand) && lc(w.model) === lc(q.model)));
    if (hit) return hit;
  }
  if (q.watch) {
    const hit = one(watches.filter((w) => lc(`${w.brand} ${w.model}`) === lc(q.watch) || lc(w.model) === lc(q.watch)));
    if (hit) return hit;
  }
  return null;
}

export function parseWearRows(rows: string[][], watches: WatchLite[], existing: { date: string; watch_id: string }[]) {
  const [header, ...body] = rows;
  const col = mapHeaders(header ?? [], WEAR_ALIASES);
  const missing = col.date == null ? ["date"] : col.watch == null && col.model == null && col.reference == null ? ["watch (or brand + model, or reference)"] : [];
  if (missing.length) return { error: `Missing required column: ${missing.join(", ")}`, results: [] as RowResult<WearDraft>[], columns: col };

  const seen = new Set(existing.map((e) => `${e.date}|${e.watch_id}`));
  const results = body.map((r, i): RowResult<WearDraft> | null => {
    if (isBlank(r)) return null;
    const get = (f: string) => (col[f] != null ? (r[col[f]] ?? "").trim() : "");
    const errors: string[] = [];
    const date = parseDateCell(get("date"));
    if (!date) errors.push(get("date") ? `date "${get("date")}" isn't a date` : "date is empty");
    const q = { brand: get("brand"), model: get("model"), reference: get("reference"), watch: get("watch") };
    const w = matchWatch(watches, q);
    const label = q.watch || [q.brand, q.model, q.reference].filter(Boolean).join(" ") || "(blank)";
    if (w === "ambiguous") errors.push(`"${label}" matches more than one watch — add a reference column`);
    else if (!w) errors.push(`no watch in your collection matches "${label}"`);
    if (errors.length || !date || !w || w === "ambiguous") return { line: i + 2, draft: null, errors };

    const draft: WearDraft = { date, watch_id: w.id };
    for (const f of ["occasion", "occasion_detail", "strap", "notes"] as const) if (get(f)) draft[f] = get(f);
    const k = `${date}|${w.id}`;
    const skip = seen.has(k) ? "already logged that day" : undefined;
    seen.add(k);
    return { line: i + 2, draft, errors, skip };
  }).filter((r): r is RowResult<WearDraft> => r !== null);
  return { error: null, results, columns: col };
}

// ---- name lookups ----------------------------------------------------------

/** Case-insensitive name → id map; names not found are returned so they can be created. */
export function resolveNames(names: (string | undefined)[], rows: (Dealer | Strap | Occasion)[]) {
  const map = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r.id]));
  const missing = [...new Set(names.filter((n): n is string => !!n?.trim()).map((n) => n.trim()))].filter((n) => !map.has(n.toLowerCase()));
  // dedupe missing case-insensitively, keeping first spelling
  const uniq = new Map<string, string>();
  for (const n of missing) if (!uniq.has(n.toLowerCase())) uniq.set(n.toLowerCase(), n);
  return { map, missing: [...uniq.values()] };
}

export const WATCH_TEMPLATE =
  "brand,model,reference,type,status,factory,factory_version,dial,case_mm,case_material,movement,dealer,strap,purchase_date,purchase_price,currency,gen_retail_price,sale_date,sale_price,favorite,condition,serial,notes\r\n" +
  "Rolex,Submariner Date,126610LN,genuine,owned,,,Black,41,Steel,3235,Local AD,Oyster bracelet,2024-05-01,10800,USD,10800,,,yes,Excellent,,\r\n";
export const WEAR_TEMPLATE =
  "date,brand,model,reference,occasion,occasion_detail,strap,notes\r\n" +
  "2026-10-01,Rolex,Submariner Date,126610LN,Daily Wear,,Oyster bracelet,\r\n";
