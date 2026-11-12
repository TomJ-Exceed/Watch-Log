// Shared types + Gemini request/response shaping for "Identify from photo". Pure TS.

export type Confidence = "high" | "medium" | "low";
export type WatchGuess = {
  brand: string;
  model: string;
  reference: string | null;
  dial_color: string | null;
  case_size_mm: number | null;
  movement: string | null;
  confidence: Confidence;
  reason: string | null;
};
export type IdentifyResult = { is_watch: boolean; candidates: WatchGuess[]; note: string | null };

export const GEMINI_MODELS = ["gemini-flash-latest", "gemini-2.5-flash"] as const;

export const IDENTIFY_PROMPT = `You identify wristwatches from photos for a collector's inventory app.
Return up to 3 candidates, most likely first. For each: brand, model (the commonly used model name, e.g. "Submariner Date", "Speedmaster Moonwatch Professional"), the manufacturer reference number, dial color, case size in mm, and caliber/movement if you know it for that reference.
Rules:
- The reference number must be a real reference for that exact model, dial and bezel combination. Distinguish close variants by visible details (dial color, bezel colors/material, bracelet, case shape, dial text). If you cannot tell which generation/variant it is, list the plausible references as separate candidates and lower the confidence. Use null rather than guessing a reference.
- The watch may be a replica; identify the genuine model it depicts.
- confidence: "high" only when the model and reference are clearly determinable; otherwise "medium" or "low".
- reason: one short phrase on the visible details that support the match.
- If the photo does not show a watch, set is_watch false and return no candidates.
- note: optional one-line tip (e.g. "photograph the caseback or the side of the case to confirm the generation"), else null.`;

const str = { type: "STRING" };
const nstr = { type: "STRING", nullable: true };
export const IDENTIFY_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_watch: { type: "BOOLEAN" },
    note: nstr,
    candidates: {
      type: "ARRAY",
      maxItems: 3,
      items: {
        type: "OBJECT",
        properties: {
          brand: str,
          model: str,
          reference: nstr,
          dial_color: nstr,
          case_size_mm: { type: "NUMBER", nullable: true },
          movement: nstr,
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
          reason: nstr,
        },
        required: ["brand", "model", "reference", "confidence"],
        propertyOrdering: ["brand", "model", "reference", "dial_color", "case_size_mm", "movement", "confidence", "reason"],
      },
    },
  },
  required: ["is_watch", "candidates"],
  propertyOrdering: ["is_watch", "candidates", "note"],
};

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Defensive parse of the model's JSON (never trust it blindly). */
export function parseIdentify(text: string): IdentifyResult {
  const raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Record<string, unknown>;
  const list = Array.isArray(raw.candidates) ? raw.candidates : [];
  const candidates = list
    .map((c: Record<string, unknown>): WatchGuess | null => {
      const brand = s(c.brand);
      const model = s(c.model);
      if (!brand || !model) return null;
      const size = typeof c.case_size_mm === "number" && c.case_size_mm > 10 && c.case_size_mm < 70 ? c.case_size_mm : null;
      const conf = c.confidence === "high" || c.confidence === "medium" ? c.confidence : "low";
      return { brand, model, reference: s(c.reference), dial_color: s(c.dial_color), case_size_mm: size, movement: s(c.movement), confidence: conf, reason: s(c.reason) };
    })
    .filter((c): c is WatchGuess => c !== null)
    .slice(0, 3);
  return { is_watch: raw.is_watch !== false && candidates.length > 0, candidates, note: s(raw.note) };
}
