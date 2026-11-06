/** Public bottle shop shelves — keep this list tiny and fixed. */
export const BOTTLE_SHOP_CATEGORIES = [
  { slug: "beer", label: "Beer" },
  { slug: "wine", label: "Wine" },
  { slug: "rtds", label: "RTDs" },
  { slug: "cruisers", label: "Cruisers" },
] as const;

export type BottleCategory = (typeof BOTTLE_SHOP_CATEGORIES)[number]["slug"];

export function isBottleCategory(value: string): value is BottleCategory {
  return BOTTLE_SHOP_CATEGORIES.some((c) => c.slug === value);
}

export function bottleCategoryLabel(slug: string): string {
  return BOTTLE_SHOP_CATEGORIES.find((c) => c.slug === slug)?.label || slug;
}

/** Resolve category from stored value, else light name/id hints. */
export function normalizeBottleCategory(
  raw: unknown,
  hints?: { id?: string; name?: string }
): BottleCategory {
  const direct = String(raw || "")
    .trim()
    .toLowerCase();
  if (isBottleCategory(direct)) return direct;

  const id = String(hints?.id || "")
    .trim()
    .toLowerCase();
  const name = String(hints?.name || "")
    .trim()
    .toLowerCase();
  const blob = `${id} ${name}`;

  if (id.startsWith("wine") || /\bwine\b|shiraz|cabernet|merlot|pinot|chardonnay|sauvignon|riesling|ros[eé]|sparkling|moscato/.test(blob)) {
    return "wine";
  }
  if (id.startsWith("beer") || /\bbeer\b|lager|ale|ipa|stout|pilsner/.test(blob)) {
    return "beer";
  }
  if (id.startsWith("rtd") || /\brtds?\b|ready.?to.?drink/.test(blob)) {
    return "rtds";
  }
  if (id.startsWith("cruiser") || /cruiser/.test(blob)) {
    return "cruisers";
  }
  return "beer";
}
