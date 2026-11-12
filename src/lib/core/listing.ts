// Copy/paste sale listing text for a watch. Lines with no value are left out.
import type { Watch } from "./database.types";
import { money } from "./format";

type ListingWatch = Pick<Watch, "brand" | "model" | "reference" | "movement" | "condition" | "type" | "factory" | "factory_version" | "asking_price" | "currency">;

export function saleListing(w: ListingWatch) {
  const factory = w.type === "replica" ? [w.factory, w.factory_version].filter(Boolean).join(" ") || null : "Genuine";
  const lines: [string, string | null][] = [
    ["Factory", factory],
    ["Model", `${w.brand} ${w.model}`.trim()],
    ["Reference", w.reference],
    ["Movement", w.movement],
    ["Price", w.asking_price != null ? money(w.asking_price, w.currency) : null],
    ["Condition", w.condition],
  ];
  return lines.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
}
