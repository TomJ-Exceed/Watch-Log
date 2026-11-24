import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { type GeminiError, describeQuota, FALLBACK_MODELS, IDENTIFY_PROMPT, IDENTIFY_SCHEMA, parseIdentify, rankFlashModels, thinkingConfigs } from "@/lib/core/identify";

export const maxDuration = 60;

const API = "https://generativelanguage.googleapis.com/v1beta";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const TOTAL_BUDGET_MS = 50_000; // stay under maxDuration so we always answer with JSON
const CALL_TIMEOUT_MS = 20_000;
const HEDGE_MS = 7_000; // if the first model hasn't answered by now, start a second one in parallel
const CACHE_MS = 6 * 60 * 60 * 1000;

type Thinking = Record<string, unknown> | null;
type Combo = { model: string; thinking: Thinking; schema: boolean };
type GeminiReply = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]; error?: GeminiError };

// Per-key memory (per warm server instance) so repeat calls skip the model lookup and trial and error.
const modelCache = new Map<string, { models: string[]; at: number }>();
const winner = new Map<string, { combo: Combo; at: number }>();
const slow = new Map<string, number>(); // keyId|model → when it last timed out or was overloaded
// Thinking settings a model has rejected ("Thinking level MINIMAL is not supported…").
const rejectedThinking = new Set<string>();
const fresh = (at: number) => Date.now() - at < CACHE_MS;
const SLOW_MS = 30 * 60 * 1000;

async function availableModels(key: string, keyId: string) {
  const hit = modelCache.get(keyId);
  if (hit && fresh(hit.at)) return hit.models;
  try {
    const res = await fetch(`${API}/models?pageSize=1000`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return FALLBACK_MODELS;
    const json = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const ranked = rankFlashModels(json.models ?? []);
    const models = ranked.length ? ranked : FALLBACK_MODELS;
    modelCache.set(keyId, { models, at: Date.now() });
    return models;
  } catch {
    return FALLBACK_MODELS;
  }
}

/** POST { image: base64 JPEG } → IdentifyResult, using the signed-in user's own Gemini key. */
export async function POST(req: Request) {
  const started = Date.now();
  const supabase = await supabaseServer();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Your session expired. Refresh the page and sign in again.", code: "auth" }, { status: 401 });

  const { data: key } = await supabase.rpc("get_gemini_key");
  if (!key) return NextResponse.json({ error: "Add your Gemini API key in Settings to use Identify.", code: "no_key" }, { status: 400 });
  const apiKey: string = key;
  const keyId = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);

  let image: string;
  try {
    ({ image } = (await req.json()) as { image: string });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  image = (image ?? "").replace(/^data:image\/\w+;base64,/, "");
  if (!image || image.length * 0.75 > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Photo is missing or too large." }, { status: 400 });

  const body = ({ thinking, schema }: Combo) => ({
    contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: image } }, { text: IDENTIFY_PROMPT }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      ...(schema ? { responseSchema: IDENTIFY_SCHEMA } : {}),
      ...(thinking ? { thinkingConfig: thinking } : {}),
    },
  });

  // Model order: last winner first; models that were recently slow/overloaded for this key go last.
  const isSlow = (m: string) => { const t = slow.get(`${keyId}|${m}`); return t !== undefined && Date.now() - t < SLOW_MS; };
  const known = winner.get(keyId);
  let models = await availableModels(key, keyId);
  if (known && fresh(known.at)) models = [known.combo.model, ...models.filter((m) => m !== known.combo.model)];
  models = [...models.filter((m) => !isSlow(m)), ...models.filter(isSlow)];

  const combosFor = (model: string): Combo[] => {
    const list: Combo[] = [];
    if (known && fresh(known.at) && known.combo.model === model) list.push(known.combo);
    for (const thinking of thinkingConfigs(model)) list.push({ model, thinking, schema: true });
    list.push({ model, thinking: null, schema: false });
    return list;
  };

  // Shared state across the parallel lanes.
  let firstError: string | null = null;
  let quota: string | null = null;
  let serverError: string | null = null;
  let timedOut = false;
  let fatal: NextResponse | null = null;
  let done = false;
  const controllers = new Set<AbortController>();
  const trail: string[] = []; // e.g. "3.8-flash 200 4.1s" — shown under errors so screenshots are diagnosable
  const note = (model: string, what: string | number, t0: number) => {
    const secs = (Date.now() - t0) / 1000;
    trail.push(`${model.replace(/^gemini-/, "")} ${what}${secs >= 1 ? ` ${secs.toFixed(0)}s` : ""}`);
  };
  const queue = [...models];
  const markSlow = (m: string) => slow.set(`${keyId}|${m}`, Date.now());

  /** Try one model through its settings; returns a result, or null to move on to the next model. */
  async function tryModel(model: string): Promise<NextResponse | null> {
    const tried = new Set<string>();
    let retried5xx = false;
    const combos = combosFor(model);
    for (let i = 0; i < combos.length && !done; i++) {
      const combo = combos[i];
      const sig = JSON.stringify(combo);
      if (tried.has(sig)) continue;
      if (combo.thinking && rejectedThinking.has(model + JSON.stringify(combo.thinking))) continue;
      tried.add(sig);
      const remaining = TOTAL_BUDGET_MS - (Date.now() - started);
      if (remaining < 4000) { timedOut = true; return null; }

      const ctrl = new AbortController();
      controllers.add(ctrl);
      const timer = setTimeout(() => ctrl.abort(new DOMException("timeout", "TimeoutError")), Math.min(CALL_TIMEOUT_MS, remaining - 2000));
      const t0 = Date.now();
      let res: Response;
      let json: GeminiReply;
      try {
        res = await fetch(`${API}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(body(combo)),
          signal: ctrl.signal,
        });
        json = (await res.json().catch(() => ({}))) as GeminiReply;
      } catch (e) {
        if (done) return null; // aborted because another lane won
        note(model, "timeout", t0);
        if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") timedOut = true;
        else firstError ??= "Couldn't reach Gemini. Try again.";
        markSlow(model);
        if (known?.combo.model === model) winner.delete(keyId);
        return null; // a slow model won't get faster on retry
      } finally {
        clearTimeout(timer);
        controllers.delete(ctrl);
      }

      note(model, res.status, t0);
      if (res.ok) {
        const text = json.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
        try {
          const result = parseIdentify(text);
          winner.set(keyId, { combo, at: Date.now() });
          slow.delete(`${keyId}|${model}`);
          return NextResponse.json(result);
        } catch {
          firstError ??= "Gemini returned something unexpected. Try another photo.";
          continue; // try the next settings (e.g. without schema)
        }
      }

      const msg = json.error?.message ?? `Gemini error ${res.status}`;
      if (/api[_ ]?key/i.test(msg) && (res.status === 400 || res.status === 401)) {
        fatal = NextResponse.json({ error: "Your Gemini API key was rejected. Update it in Settings.", code: "bad_key" }, { status: 400 });
        return null;
      }
      if (res.status === 403) {
        fatal = NextResponse.json({ error: "Your Gemini key doesn't have access. Check it in Google AI Studio.", code: "bad_key" }, { status: 400 });
        return null;
      }
      if (res.status === 429) {
        quota ??= describeQuota(json.error, model); // quotas are per model — the next one may have allowance left
        return null;
      }
      if (known && sig === JSON.stringify(known.combo)) winner.delete(keyId);
      if (res.status === 400 && combo.thinking && /thinking/i.test(msg)) {
        rejectedThinking.add(model + JSON.stringify(combo.thinking)); // settings mismatch, not a user-facing error
        continue;
      }
      if (res.status === 400 && !/no longer available|not found|deprecat/i.test(msg)) { firstError ??= msg; continue; }
      if (res.status >= 500) {
        if (!retried5xx && TOTAL_BUDGET_MS - (Date.now() - started) > 10000) {
          retried5xx = true;
          tried.delete(sig);
          await new Promise((r) => setTimeout(r, 1000));
          i--;
          continue;
        }
        serverError ??= /overload|unavailable|high demand/i.test(msg)
          ? "Google's Gemini servers are overloaded right now. Try again in a minute."
          : "Gemini is having trouble right now. Try again shortly.";
        if (res.status === 503) { markSlow(model); return null; }
        continue;
      }
      firstError ??= msg;
      return null;
    }
    return null;
  }

  /** A lane pulls models off the shared queue until one succeeds or the queue is empty. */
  async function lane(): Promise<NextResponse | null> {
    while (!done && !fatal && queue.length) {
      const r = await tryModel(queue.shift()!);
      if (r) return r;
    }
    return null;
  }

  // Hedged race: lane A starts now; lane B starts after HEDGE_MS, or as soon as lane A's first
  // model fails fast. First success wins and cancels the rest. Quick answers cost one request.
  const result = await new Promise<NextResponse | null>((resolve) => {
    let running = 0;
    let startedB = false;
    const finish = (r: NextResponse | null) => {
      if (r && !done) { done = true; controllers.forEach((c) => c.abort()); resolve(r); return; }
      if (--running === 0 && (startedB || !queue.length || fatal)) resolve(null);
      else if (!startedB && !done && !fatal && queue.length) startB(); // A finished without success before the hedge fired
    };
    const startB = () => {
      if (startedB || done) return;
      startedB = true;
      clearTimeout(hedge);
      running++;
      void lane().then(finish);
    };
    running++;
    void lane().then(finish);
    const hedge = setTimeout(startB, HEDGE_MS);
  });

  if (result) return result;
  if (fatal) return fatal;
  const detail = trail.length ? `Tried: ${trail.join(", ")}` : undefined;
  if (quota && !firstError) return NextResponse.json({ error: quota, code: "quota", detail }, { status: 429 });
  if (serverError && !firstError) return NextResponse.json({ error: serverError, code: "unavailable", detail }, { status: 503 });
  if (timedOut && !firstError) {
    return NextResponse.json({ error: "Gemini took too long to answer. Try again — a close, well-lit shot of the dial helps.", code: "timeout", detail }, { status: 504 });
  }
  return NextResponse.json({ error: firstError ?? "Gemini didn't respond. Try again.", detail }, { status: 502 });
}
