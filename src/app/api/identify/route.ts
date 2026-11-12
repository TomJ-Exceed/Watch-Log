import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { FALLBACK_MODELS, IDENTIFY_PROMPT, IDENTIFY_SCHEMA, parseIdentify, rankFlashModels, thinkingConfigs } from "@/lib/core/identify";

export const maxDuration = 30;

const API = "https://generativelanguage.googleapis.com/v1beta";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function availableModels(key: string) {
  try {
    const res = await fetch(`${API}/models?pageSize=1000`, { headers: { "x-goog-api-key": key } });
    if (!res.ok) return FALLBACK_MODELS;
    const json = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const ranked = rankFlashModels(json.models ?? []);
    return ranked.length ? ranked : FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}

/** POST { image: base64 JPEG } → IdentifyResult, using the signed-in user's own Gemini key. */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { data: key } = await supabase.rpc("get_gemini_key");
  if (!key) return NextResponse.json({ error: "Add your Gemini API key in Settings to use Identify.", code: "no_key" }, { status: 400 });

  let image: string;
  try {
    ({ image } = (await req.json()) as { image: string });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  image = (image ?? "").replace(/^data:image\/\w+;base64,/, "");
  if (!image || image.length * 0.75 > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Photo is missing or too large." }, { status: 400 });

  const body = (thinkingConfig: Record<string, unknown> | null, schema: boolean) => ({
    contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: image } }, { text: IDENTIFY_PROMPT }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      ...(schema ? { responseSchema: IDENTIFY_SCHEMA } : {}),
      ...(thinkingConfig ? { thinkingConfig } : {}),
    },
  });

  let firstError: string | null = null;
  for (const model of await availableModels(key)) {
    // Preferred settings first; last resort drops the strict schema (prompt still asks for JSON).
    const attempts: [Record<string, unknown> | null, boolean][] = [...thinkingConfigs(model).map((t) => [t, true] as [Record<string, unknown> | null, boolean]), [null, false]];
    for (const [thinking, schema] of attempts) {
      const res = await fetch(`${API}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body(thinking, schema)),
      }).catch(() => null);
      if (!res) {
        firstError ??= "Couldn't reach Gemini. Try again.";
        break;
      }
      const json = (await res.json().catch(() => ({}))) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
        error?: { message?: string };
      };
      if (res.ok) {
        const text = json.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
        try {
          return NextResponse.json(parseIdentify(text));
        } catch {
          firstError ??= "Gemini returned something unexpected. Try another photo.";
          break;
        }
      }
      const msg = json.error?.message ?? `Gemini error ${res.status}`;
      if (/api[_ ]?key/i.test(msg) && (res.status === 400 || res.status === 401)) {
        return NextResponse.json({ error: "Your Gemini API key was rejected. Update it in Settings.", code: "bad_key" }, { status: 400 });
      }
      if (res.status === 403) return NextResponse.json({ error: "Your Gemini key doesn't have access. Check it in Google AI Studio.", code: "bad_key" }, { status: 400 });
      if (res.status === 429) return NextResponse.json({ error: "Gemini rate limit or free quota reached. Try again in a minute." }, { status: 429 });
      // 400 on a thinking setting → try the next setting; anything else (404, retired model…) → next model.
      if (res.status === 400 && (thinking || schema) && !/no longer available|not found|deprecat/i.test(msg)) continue;
      firstError ??= msg;
      break;
    }
  }
  return NextResponse.json({ error: firstError ?? "Gemini didn't respond. Try again." }, { status: 502 });
}
