import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** POST { key } → validates the key with Google, then stores it (encrypted) for this user. */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { key } = (await req.json().catch(() => ({}))) as { key?: string };
  const k = (key ?? "").trim();
  if (k.length < 20) return NextResponse.json({ error: "That doesn't look like a Gemini API key." }, { status: 400 });

  const check = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": k } }).catch(() => null);
  if (!check) return NextResponse.json({ error: "Couldn't reach Google to check the key. Try again." }, { status: 502 });
  if (!check.ok) return NextResponse.json({ error: "Google rejected that key. Copy it again from Google AI Studio." }, { status: 400 });

  const { data: hint, error } = await supabase.rpc("set_gemini_key", { p_key: k });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ hint });
}
