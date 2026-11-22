import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { type GeminiError, describeQuota, FALLBACK_MODELS, IDENTIFY_PROMPT, IDENTIFY_SCHEMA, parseIdentify, rankFlashModels, thinkingConfigs } from "@/lib/core/identify";

export const maxDuration = 60;

const API = "https://generativelanguage.googleapis.com/v1beta";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const TOTAL_BUDGET_MS = 50_000; // stay under maxDuration so we always answer with JSON
const CALL_TIMEOUT_MS = 25_000;
const CACHE_MS = 6 * 60 * 60 * 1000;

type Thinking = Record<string, unknown> | null;
type Combo = { model: string; thinking: Thinking; schema: boolean };

// Per-key memory (per warm server instance) of the model list and the settings that worked,
// so repeat calls are a single Gemini request instead of a model lookup + trial and error.
const modelCache = new Map<string, { models: string[]; at: number }>();
const winner = new Map<string, { combo: Combo; at: number }>();
// Thinking settings a model has rejected ("Thinking level MINIMAL is not supported…"), so we skip them next time.
const rejectedThinking = new Set<string>();
const fresh = (at: number) => Date.now() - at < CACHE_MS;

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
  const keyId = createHash("sha256").update(key).digest("hex").slice(0, 16);

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

  // Attempt order: last known-good settings first, then each model's preferred settings,
  // ending with a schema-free request as a last resort.
  const attempts: Combo[] = [];
  const known = winner.get(keyId);
  if (known && fresh(known.at)) attempts.push(known.combo);
  for (const model of await availableModels(key, keyId)) {
    for (const thinking of thinkingConfigs(model)) attempts.push({ model, thinking, schema: true });
    attempts.push({ model, thinking: null, schema: false });
  }

  let firstError: string | null = null;
  let quota: string | null = null;
  let timedOut = false;
  const skipModels = new Set<string>();
  const tried = new Set<string>();

  for (const combo of attempts) {
    const sig = JSON.stringify(combo);
    if (tried.has(sig) || skipModels.has(combo.model)) continue;
    if (combo.thinking && rejectedThinking.has(combo.model + JSON.stringify(combo.thinking))) continue;
    tried.add(sig);
    const remaining = TOTAL_BUDGET_MS - (Date.now() - started);
    if (remaining < 4000) { timedOut = true; break; }

    let res: Response | null = null;
    try {
      res = await fetch(`${API}/models/${combo.model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body(combo)),
        signal: AbortSignal.timeout(Math.min(CALL_TIMEOUT_MS, remaining - 2000)),
      });
    } catch (e) {
      if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") timedOut = true;
      else firstError ??= "Couldn't reach Gemini. Try again.";
      skipModels.add(combo.model); // a slow/unreachable model won't get faster on retry
      continue;
    }

    const json = (await res.json().catch(() => ({}))) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      error?: GeminiError;
    };
    if (res.ok) {
      const text = json.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
      try {
        const result = parseIdentify(text);
        winner.set(keyId, { combo, at: Date.now() });
        return NextResponse.json(result);
      } catch {
        firstError ??= "Gemini returned something unexpected. Try another photo.";
        continue; // try the next settings (e.g. without schema)
      }
    }

    const msg = json.error?.message ?? `Gemini error ${res.status}`;
    if (/api[_ ]?key/i.test(msg) && (res.status === 400 || res.status === 401)) {
      return NextResponse.json({ error: "Your Gemini API key was rejected. Update it in Settings.", code: "bad_key" }, { status: 400 });
    }
    if (res.status === 403) return NextResponse.json({ error: "Your Gemini key doesn't have access. Check it in Google AI Studio.", code: "bad_key" }, { status: 400 });
    if (res.status === 429) {
      // Quotas are per model: note why, then try the next model (it may have free allowance left).
      quota ??= describeQuota(json.error, combo.model);
      skipModels.add(combo.model);
      continue;
    }
    if (known && sig === JSON.stringify(known.combo)) winner.delete(keyId);
    // A 400 about a setting → try the next setting for this model; anything else → skip the model.
    if (res.status === 400 && combo.thinking && /thinking/i.test(msg)) {
      // A settings mismatch, not something to show the user — remember it and try the next level.
      rejectedThinking.add(combo.model + JSON.stringify(combo.thinking));
      continue;
    }
    if (res.status === 400 && !/no longer available|not found|deprecat/i.test(msg)) { firstError ??= msg; continue; }
    if (res.status >= 500) { firstError ??= "Gemini is having trouble right now. Try again shortly."; continue; }
    firstError ??= msg;
    skipModels.add(combo.model);
  }

  if (quota && !firstError) return NextResponse.json({ error: quota, code: "quota" }, { status: 429 });
  if (timedOut && !firstError) {
    return NextResponse.json({ error: "Gemini took too long to answer. Try again — a close, well-lit shot of the dial helps.", code: "timeout" }, { status: 504 });
  }
  return NextResponse.json({ error: firstError ?? "Gemini didn't respond. Try again." }, { status: 502 });
}
