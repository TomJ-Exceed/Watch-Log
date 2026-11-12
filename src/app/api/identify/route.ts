import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { GEMINI_MODELS, IDENTIFY_PROMPT, IDENTIFY_SCHEMA, parseIdentify } from "@/lib/core/identify";

export const maxDuration = 30;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

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

  const body = (thinking: boolean) => ({
    contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: image } }, { text: IDENTIFY_PROMPT }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      responseSchema: IDENTIFY_SCHEMA,
      // No "thinking" tokens: keeps each call to a few hundred output tokens.
      ...(thinking ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
    },
  });

  let lastError = "Gemini didn't respond.";
  for (const model of GEMINI_MODELS) {
    for (const thinking of [false, true]) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body(thinking)),
      }).catch(() => null);
      if (!res) { lastError = "Couldn't reach Gemini. Try again."; continue; }
      const json = (await res.json().catch(() => ({}))) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        error?: { message?: string; status?: string };
      };
      if (res.ok) {
        const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        try {
          return NextResponse.json(parseIdentify(text));
        } catch {
          return NextResponse.json({ error: "Gemini returned something unexpected. Try another photo." }, { status: 502 });
        }
      }
      const msg = json.error?.message ?? `Gemini error ${res.status}`;
      if (res.status === 400 && /api key/i.test(msg)) return NextResponse.json({ error: "Your Gemini API key was rejected. Update it in Settings.", code: "bad_key" }, { status: 400 });
      if (res.status === 403) return NextResponse.json({ error: "Your Gemini key doesn't have access. Check it in Google AI Studio.", code: "bad_key" }, { status: 400 });
      if (res.status === 429) return NextResponse.json({ error: "Gemini rate limit or quota reached. Try again in a minute." }, { status: 429 });
      lastError = msg;
      if (res.status === 400 && !thinking && /thinking/i.test(msg)) continue; // model doesn't accept thinkingConfig
      break; // e.g. 404 model not found → next model
    }
  }
  return NextResponse.json({ error: lastError }, { status: 502 });
}
