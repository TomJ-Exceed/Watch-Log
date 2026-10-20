import type { DealerType, Watch } from "./database.types";

export const watchName = (w: Pick<Watch, "brand" | "model">) => `${w.brand} ${w.model}`;

export function money(n: number | null | undefined, currency = "USD") {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
}

export const DEALER_TYPE_LABEL: Record<DealerType, string> = {
  AD: "Authorized dealer",
  grey_market: "Grey market",
  rep_dealer: "Rep dealer",
  private: "Private sale",
};

export const STATUS_LABEL = { owned: "Owned", sold: "Sold", traded: "Traded", wishlist: "Wishlist" } as const;
