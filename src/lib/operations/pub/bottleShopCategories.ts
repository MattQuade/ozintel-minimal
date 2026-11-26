/** Dollars typed in the ledger, shown as Tue Nite Draw $3,500. */
export function tueDrawAmount(label: string): string {
  const match = String(label || "").match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (!match) return "";
  return match[1].replace(/,/g, "");
}

export function tueDrawLabel(amount: string): string {
  const n = Number(String(amount || "").replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return "";
  const formatted = Math.round(n).toLocaleString("en-AU");
  return `Tue Nite Draw $${formatted}`;
}

/** Public bottle shop shelves — keep this list tiny and fixed. */
export const BOTTLE_SHOP_CATEGORIES = [
  { slug: "coffee", label: "Coffee" },
  { slug: "beer", label: "Beer" },
  { slug: "wine", label: "Australian Wine" },
  { slug: "french-wine", label: "French Wine" },
  { slug: "cider", label: "Cider" },
  { slug: "rtds", label: "RTDs" },
  { slug: "cruisers", label: "Cruisers" },
] as const;

export type BottleCategory = (typeof BOTTLE_SHOP_CATEGORIES)[number]["slug"];

/** Starting coffee list. Each size is its own shelf item so it has its own quantity. */
export const COFFEE_MENU = [
  { id: "coffee-cappuccino-small", type: "Cappuccino", size: "Small" },
  { id: "coffee-cappuccino-medium", type: "Cappuccino", size: "Medium" },
  { id: "coffee-cappuccino-large", type: "Cappuccino", size: "Large" },
  { id: "coffee-latte-small", type: "Latte", size: "Small" },
  { id: "coffee-latte-medium", type: "Latte", size: "Medium" },
  { id: "coffee-latte-large", type: "Latte", size: "Large" },
  { id: "coffee-flat-white-small", type: "Flat white", size: "Small" },
  { id: "coffee-flat-white-medium", type: "Flat white", size: "Medium" },
  { id: "coffee-flat-white-large", type: "Flat white", size: "Large" },
] as const;

export const COFFEE_TYPES = ["Cappuccino", "Latte", "Flat white"] as const;

export const COFFEE_SIZES = [
  { slug: "small", label: "Small" },
  { slug: "medium", label: "Medium" },
  { slug: "large", label: "Large" },
] as const;

export type CoffeeSize = (typeof COFFEE_SIZES)[number]["slug"];

/** Coffee card layouts. Coffee 1 is the original size and milk card. */
export type CoffeeFormat = "1" | "2" | "3" | "4";

export function isCoffeeFormat(value: string): value is CoffeeFormat {
  return value === "1" || value === "2" || value === "3" || value === "4";
}

export function coffeeFormatOf(product: { coffeeFormat?: string } | null | undefined): CoffeeFormat {
  const value = String(product?.coffeeFormat || "");
  return isCoffeeFormat(value) ? value : "1";
}

/** Coffee 2 second row. Large is the only size, centred above these. */
export const COFFEE_2_CHOICES = [
  { slug: "choc", label: "Choc" },
  { slug: "strawb", label: "Strawb" },
  { slug: "caramel", label: "Caramel" },
  { slug: "vanilla", label: "Vanilla" },
] as const;

export type Coffee2Choice = (typeof COFFEE_2_CHOICES)[number]["slug"];

export function isCoffee2Choice(value: string): value is Coffee2Choice {
  return COFFEE_2_CHOICES.some((item) => item.slug === value);
}

export function coffee2ChoiceLabel(slug: string): string {
  return COFFEE_2_CHOICES.find((item) => item.slug === slug)?.label || slug;
}

/** Price written on a Coffee 3 button, such as "Cheese $5". */
export function coffeeButtonPrice(label: string, fallback = 0): number {
  const matches = String(label || "").match(/\$\s*(\d+(?:\.\d{1,2})?)/g);
  if (!matches || !matches.length) {
    const fallbackPrice = Number(fallback);
    return Number.isFinite(fallbackPrice) && fallbackPrice > 0 ? fallbackPrice : 0;
  }
  const amount = Number(matches[matches.length - 1].replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

/** Coffee 3 is one row of three labels the ledger can rename. */
export function normalizeCoffee3Buttons(raw: unknown): [string, string, string] {
  const list = Array.isArray(raw) ? raw : [];
  return [0, 1, 2].map((index) => {
    const text = String(list[index] || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 18);
    return text || `Button ${index + 1}`;
  }) as [string, string, string];
}

export type StockMenuChoice = {
  value: string;
  label: string;
  category: BottleCategory;
  coffeeFormat?: CoffeeFormat;
};

/** Stock dropdown. Coffee stays one public shelf, with four card formats. */
export const STOCK_MENU: StockMenuChoice[] = [
  { value: "coffee-1", label: "Coffee 1", category: "coffee", coffeeFormat: "1" },
  { value: "coffee-2", label: "Coffee 2", category: "coffee", coffeeFormat: "2" },
  { value: "coffee-3", label: "Coffee 3", category: "coffee", coffeeFormat: "3" },
  { value: "coffee-4", label: "Coffee 4", category: "coffee", coffeeFormat: "4" },
  ...BOTTLE_SHOP_CATEGORIES.filter((item) => item.slug !== "coffee").map((item) => ({
    value: item.slug,
    label: item.label,
    category: item.slug,
  })),
];

export function stockMenuValue(category: string, format?: string): string {
  if (category === "coffee") return `coffee-${coffeeFormatOf({ coffeeFormat: format })}`;
  return isBottleCategory(category) ? category : "beer";
}

export function stockMenuChoice(value: string): StockMenuChoice {
  return (
    STOCK_MENU.find((item) => item.value === value) ||
    STOCK_MENU.find((item) => item.value === "beer") ||
    STOCK_MENU[0]
  );
}

/** Milk on a coffee order. Full cream is the usual choice. */
export const COFFEE_MILKS = [
  { slug: "full-cream", label: "Full cream", button: "Full cream" },
  { slug: "lite", label: "Lite milk", button: "Lite" },
  { slug: "lactose-free", label: "Lactose free", button: "Lact. free" },
  { slug: "almond", label: "Almond", button: "Almond" },
  { slug: "oat", label: "Oat", button: "Oat" },
  { slug: "soy", label: "Soy", button: "Soy" },
] as const;

export type CoffeeMilk = (typeof COFFEE_MILKS)[number]["slug"];

/** Phone layout: dairy on the first row, the 50c milks on the second. */
export const COFFEE_MILK_ROWS: CoffeeMilk[][] = [
  ["full-cream", "lite", "lactose-free"],
  ["almond", "oat", "soy"],
];

/** Almond, oat, and soy add 50 cents per cup. */
export const COFFEE_MILK_EXTRA = 0.5;

export function coffeeMilkExtra(milk: string): number {
  return milk === "almond" || milk === "oat" || milk === "soy"
    ? COFFEE_MILK_EXTRA
    : 0;
}

export function coffeeUnitPrice(base: number, milk?: string): number {
  return Math.max(0, Number(base) || 0) + coffeeMilkExtra(String(milk || ""));
}

export function isCoffeeMilk(value: string): value is CoffeeMilk {
  return COFFEE_MILKS.some((milk) => milk.slug === value);
}

export function coffeeMilkLabel(milk: string): string {
  return COFFEE_MILKS.find((item) => item.slug === milk)?.label || milk;
}

/** One shelf line per cup and milk, so oat and soy of the same size stay separate. */
export function coffeeLineKey(productId: string, option: string): string {
  return `${productId}::${option}`;
}

export function isCoffeeSize(value: string): value is CoffeeSize {
  return COFFEE_SIZES.some((size) => size.slug === value);
}

export function coffeeSizeLabel(size: string): string {
  return COFFEE_SIZES.find((item) => item.slug === size)?.label || size;
}

/** "Mocha small" is the drink Mocha at size Small, not a new drink. */
export function splitCoffeeName(name: string): {
  typeName: string;
  size?: CoffeeSize;
} {
  const trimmed = String(name || "").trim().replace(/\s+/g, " ");
  const match = trimmed.match(/^(.*)\s+(small|medium|large)$/i);
  const size = match?.[2]?.toLowerCase() || "";
  const typeName = match?.[1]?.trim() || "";
  if (typeName && isCoffeeSize(size)) return { typeName, size };
  return { typeName: trimmed };
}

/** Stable id so "Long black" + Small is one shelf line, not a new row every save. */
export function coffeeProductId(typeName: string, size: CoffeeSize): string {
  const slug = String(typeName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `coffee-${slug}-${size}` : "";
}

export type CoffeeShelfGroup = {
  type: string;
  rows: Array<{ id: string; sizeLabel: string }>;
};

/**
 * Cappuccino, Latte, and Flat white stay first.
 * Any later coffee added with cup sizes is grouped the same way.
 */
export function coffeeShelfGroups(
  products: Array<{ id: string; coffeeType?: string; size?: string; coffeeFormat?: string }>
): CoffeeShelfGroup[] {
  const stocked = new Set(
    products
      .filter((product) => coffeeFormatOf(product) === "1")
      .map((product) => product.id)
  );
  const groups: CoffeeShelfGroup[] = [];
  for (const type of COFFEE_TYPES) {
    const rows = COFFEE_MENU.filter(
      (item) => item.type === type && stocked.has(item.id)
    ).map((item) => ({
      id: item.id,
      sizeLabel: item.size,
    }));
    if (rows.length) groups.push({ type, rows });
  }
  const knownIds = new Set(groups.flatMap((group) => group.rows.map((row) => row.id)));
  const extra = new Map<string, CoffeeShelfGroup>();
  for (const product of products) {
    if (coffeeFormatOf(product) !== "1") continue;
    if (knownIds.has(product.id)) continue;
    const type = String(product.coffeeType || "").trim();
    const size = String(product.size || "").trim().toLowerCase();
    if (!type || !isCoffeeSize(size)) continue;
    if (COFFEE_TYPES.some((known) => known.toLowerCase() === type.toLowerCase())) {
      continue;
    }
    let group = extra.get(type.toLowerCase());
    if (!group) {
      group = { type, rows: [] };
      extra.set(type.toLowerCase(), group);
    }
    if (group.rows.some((row) => row.id === product.id)) continue;
    group.rows.push({ id: product.id, sizeLabel: coffeeSizeLabel(size) });
    knownIds.add(product.id);
  }
  const sizeRank = (label: string) =>
    COFFEE_SIZES.findIndex((size) => size.label === label);
  for (const group of extra.values()) {
    group.rows.sort((a, b) => sizeRank(a.sizeLabel) - sizeRank(b.sizeLabel));
    groups.push(group);
  }
  return groups;
}

export function isBottleCategory(value: string): value is BottleCategory {
  return BOTTLE_SHOP_CATEGORIES.some((c) => c.slug === value);
}

export function bottleCategoryLabel(slug: string): string {
  return BOTTLE_SHOP_CATEGORIES.find((c) => c.slug === slug)?.label || slug;
}

function foldShelfName(name: string): string {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Médoc and Chantemerle belong on the French Wine shelf. */
export function isFrenchShelfWine(name: string): boolean {
  const folded = foldShelfName(name);
  return folded.includes("medoc") || folded.includes("chantemerle");
}

/** The $29 Bordeaux Supérieur still filed under Australian Wine. */
export function isBordeauxSuperieurAt29(name: string, price: unknown): boolean {
  const folded = foldShelfName(name);
  if (!folded.includes("bordeaux") || !folded.includes("superieur")) return false;
  const n = Number(price);
  return Number.isFinite(n) && Math.abs(n - 29) < 0.001;
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

  if (
    /\bcoffees?\b|cappuccino|latte|flat\s*white|long\s*black|espresso|mocha|macchiato|piccolo/.test(
      blob
    )
  ) {
    return "coffee";
  }
  if (isFrenchShelfWine(name) || isFrenchShelfWine(id)) return "french-wine";
  if (id.startsWith("wine") || /\bwine\b|shiraz|cabernet|merlot|pinot|chardonnay|sauvignon|riesling|ros[eé]|sparkling|moscato/.test(blob)) {
    return "wine";
  }
  if (id.startsWith("cider") || /\bcider\b/.test(blob)) {
    return "cider";
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
