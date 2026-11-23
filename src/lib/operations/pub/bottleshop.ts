import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import {
  getBottleShopFilePath,
  getBottleShopPhotosDir,
  getPubOpsDataDir,
  getRepoSeedBottleShopPath,
} from "@/lib/dataPaths";
import {
  COFFEE_MENU,
  coffee2ChoiceLabel,
  coffeeFormatOf,
  coffeeProductId,
  coffeeMilkLabel,
  coffeeSizeLabel,
  coffeeUnitPrice,
  isBordeauxSuperieurAt29,
  isCoffee2Choice,
  isCoffeeFormat,
  isCoffeeMilk,
  isCoffeeSize,
  isFrenchShelfWine,
  normalizeBottleCategory,
  normalizeCoffee3Buttons,
  splitCoffeeName,
  type BottleCategory,
  type CoffeeFormat,
  type CoffeeSize,
} from "@/lib/operations/pub/bottleShopCategories";

export type { BottleCategory };

export type BottleProduct = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  active: boolean;
  category: BottleCategory;
  /** Set on coffees added with a cup size. */
  size?: CoffeeSize;
  /** Drink name without the size, e.g. "Long black". */
  coffeeType?: string;
  /** Coffee 1 keeps sizes and milks. Coffee 2 and 3 use their own buttons. */
  coffeeFormat?: CoffeeFormat;
  /** Coffee 3 button labels, always three. */
  buttons?: [string, string, string];
};

export type BottleOrderLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  category?: BottleCategory;
  /** Coffee milk slug. Beer and wine leave this off. */
  milk?: string;
  /** Coffee 2 or Coffee 3 button. Coffee 1 leaves this off. */
  choice?: string;
};

export type BottleOrder = {
  id: string;
  createdAt: string;
  customerName: string;
  customerNote: string;
  customerId?: string;
  /** Pub reply, shown in the customer's bottle shop. No phone number. */
  pubReply?: string;
  pubReplyAt?: string;
  lines: BottleOrderLine[];
  total: number;
  status: "reserved" | "collected" | "cancelled";
};

/** Manually added customers who restore on /bottleshop with their username. */
export type BottleCustomer = {
  id: string;
  name: string;
  /** Restore username on /bottleshop, e.g. jsmith@ozintel */
  login: string;
  phone: string;
  note: string;
  /** @deprecated Invite codes removed — kept for older ledger JSON only. */
  accessCode: string;
  active: boolean;
  createdAt: string;
};

/** Brown hub buttons under the shelves (labels editable in Pub Ops). */
export type BottleHubButton = {
  id: string;
  label: string;
};

const DEFAULT_HUB_BUTTONS: BottleHubButton[] = [
  { id: "tue-draw", label: "Tue Nite Draw $2,500" },
  { id: "fri-raffles", label: "Fri Nite Meat Raffles" },
];

type BottleShopStore = {
  products: BottleProduct[];
  orders: BottleOrder[];
  customers: BottleCustomer[];
  hubButtons: BottleHubButton[];
};

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function defaultStore(): BottleShopStore {
  return {
    products: [],
    orders: [],
    customers: [],
    hubButtons: DEFAULT_HUB_BUTTONS.map((b) => ({ ...b })),
  };
}

function normalizeHubButtons(raw: unknown): BottleHubButton[] {
  const byId = new Map<string, string>();
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const id = String((row as { id?: unknown }).id || "").trim();
      const label = String((row as { label?: unknown }).label || "").trim();
      if (!id || !label) continue;
      byId.set(id, label);
    }
  }
  return DEFAULT_HUB_BUTTONS.map((fallback) => ({
    id: fallback.id,
    label: byId.get(fallback.id) || fallback.label,
  }));
}

function normalizeAccessCode(raw: string) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeLogin(raw: string) {
  return String(raw || "").trim().toLowerCase();
}

/** Prefer explicit login; fall back to name when it looks like a username. */
export function bottleCustomerLogin(customer: {
  login?: string;
  name?: string;
}): string {
  const login = normalizeLogin(customer.login || "");
  if (login) return login;
  const name = normalizeLogin(customer.name || "");
  if (name.includes("@")) return name;
  return "";
}

function normalizeCustomer(
  raw: Partial<BottleCustomer> & { login?: string }
): BottleCustomer | null {
  const id = String(raw.id || "").trim();
  const name = String(raw.name || "").trim();
  if (!id || !name) return null;
  const accessCode = normalizeAccessCode(String(raw.accessCode || "")) || "NONE";
  return {
    id,
    name,
    login: bottleCustomerLogin(raw),
    phone: String(raw.phone || "").trim(),
    note: String(raw.note || "").trim(),
    accessCode,
    active: raw.active !== false,
    createdAt: String(raw.createdAt || new Date().toISOString()),
  };
}

/** Add the coffee sizes once. Later deletes stay deleted. */
function addCoffeeMenu(products: BottleProduct[]): boolean {
  if (products.some((product) => product.id.startsWith("coffee-"))) return false;
  for (const item of COFFEE_MENU) {
    products.push({
      id: item.id,
      name: `${item.type} ${item.size.toLowerCase()}`,
      price: 0,
      quantity: 20,
      imageUrl: "/bottleshop/wine-01.svg",
      active: true,
      category: "coffee",
    });
  }
  return true;
}

function normalizeProduct(raw: Partial<BottleProduct>): BottleProduct | null {
  const id = String(raw.id || "").trim();
  const name = String(raw.name || "").trim();
  if (!id || !name) return null;
  const category = normalizeBottleCategory(raw.category, { id, name });
  const sizeRaw = String(raw.size || "").trim().toLowerCase();
  const coffeeType = String(raw.coffeeType || "").trim();
  const formatRaw = String(raw.coffeeFormat || "").trim();
  const coffeeFormat: CoffeeFormat | undefined =
    category === "coffee" ? (isCoffeeFormat(formatRaw) ? formatRaw : "1") : undefined;
  return {
    id,
    name,
    price: Math.max(0, Number(raw.price) || 0),
    quantity: Math.max(0, Math.floor(Number(raw.quantity) || 0)),
    imageUrl: String(raw.imageUrl || `/bottleshop/${id}.svg`).trim(),
    active: raw.active !== false,
    category,
    ...(coffeeFormat === "1" && isCoffeeSize(sizeRaw) ? { size: sizeRaw } : {}),
    ...(coffeeFormat === "2" || coffeeFormat === "4" ? { size: "large" as const } : {}),
    ...(category === "coffee" && coffeeType ? { coffeeType } : {}),
    ...(coffeeFormat ? { coffeeFormat } : {}),
    ...(coffeeFormat === "3"
      ? { buttons: normalizeCoffee3Buttons(raw.buttons) }
      : {}),
  };
}

async function ensureDirs() {
  await fs.mkdir(getPubOpsDataDir(), { recursive: true });
  await fs.mkdir(getBottleShopPhotosDir(), { recursive: true });
}

function photoFilePath(productId: string) {
  return path.join(getBottleShopPhotosDir(), `${productId}.jpg`);
}

/** Public URL for an uploaded product photo (served from the owner volume). */
export function bottleProductPhotoUrl(productId: string, version?: number | string) {
  const v = version != null ? `?v=${version}` : "";
  return `/api/bottleshop/photos/${encodeURIComponent(productId)}${v}`;
}

async function maybeSeedFromRepo() {
  const target = getBottleShopFilePath();
  try {
    await fs.access(target);
    return;
  } catch {
    // missing — try seed
  }
  try {
    const seedRaw = await fs.readFile(getRepoSeedBottleShopPath(), "utf8");
    await ensureDirs();
    await fs.writeFile(target, seedRaw, "utf8");
  } catch {
    await ensureDirs();
    await fs.writeFile(
      target,
      JSON.stringify(defaultStore(), null, 2),
      "utf8"
    );
  }
}

/** Move the French bottles off Australian Wine. Writes only while they are still there. */
function moveFrenchWines(products: unknown): boolean {
  if (!Array.isArray(products)) return false;
  let changed = false;
  for (const row of products) {
    if (!row || typeof row !== "object") continue;
    const product = row as { name?: unknown; category?: unknown; price?: unknown };
    const name = String(product.name || "");
    if (!isFrenchShelfWine(name) && !isBordeauxSuperieurAt29(name, product.price)) continue;
    const category = String(product.category || "")
      .trim()
      .toLowerCase();
    if (category === "french-wine") continue;
    if (category && category !== "wine") continue;
    product.category = "french-wine";
    changed = true;
  }
  return changed;
}

async function readStore(): Promise<BottleShopStore> {
  await ensureDirs();
  await maybeSeedFromRepo();
  try {
    const raw = await fs.readFile(getBottleShopFilePath(), "utf8");
    const parsed = JSON.parse(raw || "{}") as Partial<BottleShopStore>;
    if (moveFrenchWines(parsed.products)) {
      await fs.writeFile(
        getBottleShopFilePath(),
        JSON.stringify(parsed, null, 2),
        "utf8"
      );
    }
    const products = Array.isArray(parsed.products)
      ? parsed.products
          .map((p) => normalizeProduct(p))
          .filter((p): p is BottleProduct => Boolean(p))
      : [];
    const orders = Array.isArray(parsed.orders)
      ? (parsed.orders as BottleOrder[])
      : [];
    const customers = Array.isArray(parsed.customers)
      ? parsed.customers
          .map((c) => normalizeCustomer(c))
          .filter((c): c is BottleCustomer => Boolean(c))
      : [];
    const hubButtons = normalizeHubButtons(
      (parsed as { hubButtons?: unknown }).hubButtons
    );
    const store = { products, orders, customers, hubButtons };
    if (addCoffeeMenu(store.products)) await writeStore(store);
    return store;
  } catch {
    return defaultStore();
  }
}

async function writeStore(store: BottleShopStore) {
  await ensureDirs();
  await fs.writeFile(
    getBottleShopFilePath(),
    JSON.stringify(store, null, 2),
    "utf8"
  );
}

export async function listBottleProducts(opts?: {
  activeOnly?: boolean;
  inStockOnly?: boolean;
  category?: BottleCategory;
}): Promise<BottleProduct[]> {
  const store = await readStore();
  return store.products.filter((p) => {
    if (opts?.activeOnly && !p.active) return false;
    if (opts?.inStockOnly && p.quantity <= 0) return false;
    if (opts?.category && p.category !== opts.category) return false;
    return true;
  });
}

export async function listBottleOrders(limit = 50): Promise<BottleOrder[]> {
  const store = await readStore();
  return [...store.orders].reverse().slice(0, limit);
}

export async function countReservedBottleOrders(): Promise<number> {
  const store = await readStore();
  return store.orders.filter((o) => o.status === "reserved").length;
}

export async function loadBottleShopAdmin() {
  const store = await readStore();
  const orders = [...store.orders].reverse().slice(0, 100);
  return {
    products: store.products,
    orders,
    customers: [...store.customers].reverse(),
    hubButtons: store.hubButtons,
    reservedCount: store.orders.filter((o) => o.status === "reserved").length,
  };
}

export async function listBottleHubButtons(): Promise<BottleHubButton[]> {
  const store = await readStore();
  return store.hubButtons;
}

export async function updateBottleHubButtonLabel(
  id: string,
  label: string
): Promise<BottleHubButton> {
  const buttonId = String(id || "").trim();
  const nextLabel = String(label || "").trim();
  if (!buttonId) throw new Error("Button id is required");
  if (!nextLabel) throw new Error("Button label is required");

  const store = await readStore();
  const idx = store.hubButtons.findIndex((b) => b.id === buttonId);
  if (idx < 0) throw new Error("Unknown hub button");
  const next: BottleHubButton = { id: buttonId, label: nextLabel };
  const hubButtons = [...store.hubButtons];
  hubButtons[idx] = next;
  await writeStore({ ...store, hubButtons });
  return next;
}

/** Normalize restore usernames (phones sometimes turn @ into 2). */
export function restoreQueryVariants(query: string): string[] {
  const q = normalizeLogin(query);
  if (!q) return [];
  const out = new Set<string>([q]);
  if (!q.includes("@") && /^[a-z0-9._+-]+2[a-z0-9.-]+$/i.test(q)) {
    out.add(q.replace(/2/, "@"));
  }
  if (q.includes("@")) {
    out.add(q.replace("@", "2"));
  }
  return [...out];
}

/**
 * Match an active ledger customer by restore username, name, note, or phone.
 * Lets people already listed in the Bottle Shop ledger unlock via Restore.
 */
export async function findBottleCustomerForRestore(
  query: string
): Promise<BottleCustomer | null> {
  const variants = restoreQueryVariants(query);
  if (!variants.length) return null;
  const store = await readStore();
  const qPhone = normalizeLogin(query).replace(/\D/g, "");
  return (
    store.customers.find((c) => {
      if (!c.active) return false;
      const keys = [
        bottleCustomerLogin(c),
        normalizeLogin(c.name),
        normalizeLogin(c.note),
        normalizeLogin(c.phone),
      ].filter(Boolean);
      if (variants.some((v) => keys.includes(v))) return true;
      if (qPhone.length >= 8) {
        const phoneDigits = String(c.phone || "").replace(/\D/g, "");
        if (phoneDigits && phoneDigits === qPhone) return true;
      }
      return false;
    }) || null
  );
}

export async function addBottleCustomer(input: {
  name: string;
  login?: string;
  phone?: string;
  note?: string;
}): Promise<BottleCustomer> {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Customer name is required");
  const login = bottleCustomerLogin({
    login: input.login,
    name,
  });
  if (!login) {
    throw new Error(
      "Username is required (e.g. jsmith@ozintel) so they can Restore My Account."
    );
  }
  const store = await readStore();
  const clash = store.customers.find(
    (c) => c.active && bottleCustomerLogin(c) === login
  );
  if (clash) {
    throw new Error(`Username ${login} is already used by ${clash.name}`);
  }
  const customer: BottleCustomer = {
    id: newId("cust"),
    name,
    login,
    phone: String(input.phone || "").trim(),
    note: String(input.note || "").trim(),
    accessCode: "NONE",
    active: true,
    createdAt: new Date().toISOString(),
  };
  store.customers.push(customer);
  await writeStore(store);

  const { ensureApprovedBottleShopUser } = await import("@/lib/users");
  await ensureApprovedBottleShopUser({
    email: login,
    name,
    phone: customer.phone,
  });

  return customer;
}

export async function setBottleCustomerActive(
  id: string,
  active: boolean
): Promise<BottleCustomer> {
  const store = await readStore();
  const idx = store.customers.findIndex((c) => c.id === id);
  if (idx < 0) throw new Error("Customer not found");
  store.customers[idx] = { ...store.customers[idx], active: Boolean(active) };
  await writeStore(store);
  return store.customers[idx];
}

/** Permanently remove a ledger customer and revoke their Bottle Shop login. */
export async function deleteBottleCustomer(
  id: string
): Promise<{ deleted: BottleCustomer }> {
  const store = await readStore();
  const idx = store.customers.findIndex((c) => c.id === id);
  if (idx < 0) throw new Error("Customer not found");
  const [deleted] = store.customers.splice(idx, 1);
  await writeStore(store);

  const login = bottleCustomerLogin(deleted);
  if (login) {
    const { findUserByEmail, writeUsers, readUsersFast } = await import(
      "@/lib/users"
    );
    const user = await findUserByEmail(login);
    if (user?.permissions?.bottleShop) {
      const users = await readUsersFast();
      const uIdx = users.findIndex(
        (u) => u.email.trim().toLowerCase() === login
      );
      if (uIdx >= 0) {
        users[uIdx] = {
          ...users[uIdx],
          permissions: {
            ...users[uIdx].permissions,
            bottleShop: false,
          },
        };
        await writeUsers(users);
      }
    }
  }

  return { deleted };
}

export async function saveBottleProductPhoto(
  productId: string,
  buffer: Buffer
): Promise<BottleProduct> {
  const id = String(productId || "").trim();
  if (!id) throw new Error("productId is required");
  if (!buffer?.length) throw new Error("Photo file is empty");

  const store = await readStore();
  const idx = store.products.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error("Product not found");

  await ensureDirs();
  let jpeg: Buffer;
  try {
    jpeg = await sharp(buffer)
      .rotate()
      .resize({
        width: 900,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (error) {
    console.error("[saveBottleProductPhoto] sharp", error);
    throw new Error(
      "Could not process that photo. Use a JPEG/PNG from the camera roll."
    );
  }
  await fs.writeFile(photoFilePath(id), jpeg);

  const next: BottleProduct = {
    ...store.products[idx],
    imageUrl: bottleProductPhotoUrl(id, Date.now()),
  };
  store.products[idx] = next;
  await writeStore(store);
  return next;
}

export async function readBottleProductPhoto(
  productId: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const id = String(productId || "").trim();
  if (!id) return null;
  const filePath = photoFilePath(id);
  try {
    const buffer = await fs.readFile(filePath);
    return { buffer, contentType: "image/jpeg" };
  } catch {
    return null;
  }
}

export async function updateBottleProduct(
  id: string,
  patch: Partial<
    Pick<
      BottleProduct,
      | "name"
      | "price"
      | "quantity"
      | "imageUrl"
      | "active"
      | "category"
      | "coffeeFormat"
      | "buttons"
    >
  >
): Promise<BottleProduct> {
  const store = await readStore();
  const idx = store.products.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error("Product not found");
  const current = store.products[idx];
  const nextName =
    patch.name != null ? String(patch.name).trim() || current.name : current.name;
  const next: BottleProduct = {
    ...current,
    name: nextName,
    price:
      patch.price != null
        ? Math.max(0, Number(patch.price) || 0)
        : current.price,
    quantity:
      patch.quantity != null
        ? Math.max(0, Math.floor(Number(patch.quantity) || 0))
        : current.quantity,
    imageUrl:
      patch.imageUrl != null
        ? String(patch.imageUrl).trim() || current.imageUrl
        : current.imageUrl,
    active: patch.active != null ? Boolean(patch.active) : current.active,
    category:
      patch.category != null
        ? normalizeBottleCategory(patch.category, {
            id: current.id,
            name: nextName,
          })
        : current.category,
    ...(patch.coffeeFormat != null ? { coffeeFormat: patch.coffeeFormat } : {}),
    ...(patch.buttons != null ? { buttons: patch.buttons } : {}),
  };
  const normalized = normalizeProduct(next);
  if (!normalized) throw new Error("Product name is required");
  store.products[idx] = normalized;
  await writeStore(store);
  return normalized;
}

/** Remove one product from this owner's bottle shop, including its photo. */
export async function deleteBottleProduct(id: string): Promise<void> {
  const productId = String(id || "").trim();
  if (
    !productId ||
    productId.includes("/") ||
    productId.includes("\\") ||
    productId.includes("..")
  ) {
    throw new Error("Product not found");
  }
  const store = await readStore();
  const idx = store.products.findIndex((p) => p.id === productId);
  if (idx < 0) throw new Error("Product not found");
  store.products.splice(idx, 1);
  await writeStore(store);
  try {
    await fs.unlink(photoFilePath(productId));
  } catch {
    // No uploaded photo for this product.
  }
}

/** One new coffee drink, with a stock line for each chosen cup size. */
export async function createCoffeeProducts(input: {
  name: string;
  price?: number;
  quantity?: number;
  sizes: string[];
}): Promise<{ products: BottleProduct[]; skipped: string[] }> {
  const split = splitCoffeeName(input.name);
  const typeName = split.typeName;
  if (!typeName) throw new Error("Product name is required");
  const picked = input.sizes
    .map((size) => String(size || "").trim().toLowerCase())
    .find(isCoffeeSize);
  // One size per add. A deleted size is not put back because another size was chosen.
  const size = split.size || picked;
  if (!size) throw new Error("Choose Small, Medium, or Large.");
  const sizes = [size];
  if (!coffeeProductId(typeName, "small")) {
    throw new Error("Use a coffee name with letters.");
  }

  const store = await readStore();
  const created: BottleProduct[] = [];
  const skipped: string[] = [];
  for (const size of sizes) {
    const id = coffeeProductId(typeName, size);
    const label = coffeeSizeLabel(size);
    if (store.products.some((product) => product.id === id)) {
      skipped.push(label);
      continue;
    }
    const product: BottleProduct = {
      id,
      name: `${typeName} ${label.toLowerCase()}`,
      price: Math.max(0, Number(input.price) || 0),
      quantity: Math.max(0, Math.floor(Number(input.quantity) || 0)),
      imageUrl: "/bottleshop/wine-01.svg",
      active: true,
      category: "coffee",
      size,
      coffeeType: typeName,
      coffeeFormat: "1",
    };
    store.products.push(product);
    created.push(product);
  }
  if (!created.length) {
    const already = skipped.length ? ` ${skipped.join(", ").toLowerCase()}` : "";
    throw new Error(`${typeName}${already} is already in the stock.`);
  }
  await writeStore(store);
  return { products: created, skipped };
}

/** Coffee 2 is Large plus flavours. Coffee 3 is three editable buttons. Coffee 4 is Large only. */
export async function createStyledCoffee(input: {
  name: string;
  price?: number;
  quantity?: number;
  format: "2" | "3" | "4";
  buttons?: string[];
}): Promise<BottleProduct> {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Product name is required");
  const format = input.format === "3" ? "3" : input.format === "4" ? "4" : "2";
  const store = await readStore();
  const product: BottleProduct = {
    id: newId("coffee"),
    name,
    price: Math.max(0, Number(input.price) || 0),
    quantity: Math.max(0, Math.floor(Number(input.quantity) || 0)),
    imageUrl: "/bottleshop/wine-01.svg",
    active: true,
    category: "coffee",
    coffeeType: name,
    coffeeFormat: format,
    ...(format === "2" || format === "4" ? { size: "large" as const } : {}),
    ...(format === "3" ? { buttons: normalizeCoffee3Buttons(input.buttons) } : {}),
  };
  store.products.push(product);
  await writeStore(store);
  return product;
}

export async function createBottleProduct(input: {
  name: string;
  price?: number;
  quantity?: number;
  category?: BottleCategory | string;
}): Promise<BottleProduct> {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Product name is required");
  const store = await readStore();
  const id = newId("item");
  const product: BottleProduct = {
    id,
    name,
    price: Math.max(0, Number(input.price) || 0),
    quantity: Math.max(0, Math.floor(Number(input.quantity) || 0)),
    imageUrl: "/bottleshop/wine-01.svg",
    active: true,
    category: normalizeBottleCategory(input.category, { id, name }),
  };
  store.products.push(product);
  await writeStore(store);
  return product;
}

export type PlaceOrderInput = {
  items: Array<{ productId: string; quantity: number; milk?: string; choice?: string }>;
  customerName?: string;
  customerNote?: string;
  customerId?: string;
};

export type PlaceOrderResult = {
  order: BottleOrder;
  products: BottleProduct[];
  /** Whole reserve, kept for the ledger. */
  smsBody: string;
  /** Coffee lines only. Null when the reserve has no coffee. */
  coffeeSmsBody: string | null;
  /** Bottle lines only. Null when the reserve is coffee only. */
  pubSmsBody: string | null;
};

function orderText(
  title: string,
  lines: BottleOrderLine[],
  customerName: string,
  customerNote: string
): string {
  const total = lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0
  );
  return [
    title,
    lines.map((line) => `${line.quantity}x ${line.name}`).join(", "),
    `Total: $${total.toFixed(2)}`,
    `Name: ${customerName}`,
    customerNote ? `Note: ${customerNote}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function placeBottleOrder(
  input: PlaceOrderInput
): Promise<PlaceOrderResult> {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throw new Error("Select at least one item");

  const wanted = new Map<
    string,
    { productId: string; milk: string; choice: string; quantity: number }
  >();
  for (const item of items) {
    const productId = String(item.productId || "").trim();
    const quantity = Math.floor(Number(item.quantity) || 0);
    if (!productId || quantity <= 0) continue;
    const milk = isCoffeeMilk(String(item.milk || "").trim())
      ? String(item.milk).trim()
      : "";
    const choice = String(item.choice || "").trim();
    const key = `${productId}\0${milk}\0${choice}`;
    const prev = wanted.get(key);
    if (prev) prev.quantity += quantity;
    else wanted.set(key, { productId, milk, choice, quantity });
  }
  if (!wanted.size) throw new Error("Select at least one item");

  const store = await readStore();
  const lines: BottleOrderLine[] = [];

  for (const { productId, milk, choice, quantity } of wanted.values()) {
    const product = store.products.find((p) => p.id === productId && p.active);
    if (!product) throw new Error(`Bottle not found: ${productId}`);
    // Coffee is made to order. Stock counts stay on beer and wine.
    if (product.category !== "coffee") {
      if (product.quantity < quantity) {
        throw new Error(
          `Only ${product.quantity} left of ${product.name} (requested ${quantity})`
        );
      }
      product.quantity -= quantity;
    }
    const format = product.category === "coffee" ? coffeeFormatOf(product) : "1";
    let lineName = product.name;
    let unitPrice = product.price;
    let milkSlug = "";
    let choiceSlug = "";
    if (product.category === "coffee" && format === "1") {
      milkSlug = isCoffeeMilk(milk) ? milk : "full-cream";
      lineName = `${product.name}, ${coffeeMilkLabel(milkSlug)}`;
      unitPrice = coffeeUnitPrice(product.price, milkSlug);
    } else if (product.category === "coffee" && format === "2") {
      if (!isCoffee2Choice(choice)) {
        throw new Error("Choose Choc, Strawb, Caramel, or Vanilla.");
      }
      choiceSlug = choice;
      const drink = /\blarge\b/i.test(product.name)
        ? product.name
        : `${product.name}, Large`;
      lineName = `${drink}, ${coffee2ChoiceLabel(choice)}`;
    } else if (product.category === "coffee" && format === "3") {
      const buttons = normalizeCoffee3Buttons(product.buttons);
      const index = Number(choice);
      if (!Number.isInteger(index) || index < 0 || index > 2) {
        throw new Error("Choose one of the three buttons.");
      }
      choiceSlug = String(index);
      lineName = `${product.name}, ${buttons[index]}`;
    } else if (product.category === "coffee" && format === "4") {
      lineName = /\blarge\b/i.test(product.name)
        ? product.name
        : `${product.name}, Large`;
    }
    lines.push({
      productId: product.id,
      name: lineName,
      quantity,
      unitPrice,
      category: product.category,
      ...(milkSlug ? { milk: milkSlug } : {}),
      ...(choiceSlug ? { choice: choiceSlug } : {}),
    });
  }

  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const customerName =
    String(input.customerName || "").trim() || "Customer";
  const customerNote = String(input.customerNote || "").trim();
  const order: BottleOrder = {
    id: newId("ord"),
    createdAt: new Date().toISOString(),
    customerName,
    customerNote,
    customerId: String(input.customerId || "").trim() || undefined,
    lines,
    total,
    status: "reserved",
  };
  store.orders.push(order);
  await writeStore(store);

  const coffeeLines = lines.filter((line) => line.category === "coffee");
  const pubLines = lines.filter((line) => line.category !== "coffee");
  const coffeeSmsBody = coffeeLines.length
    ? orderText("COFFEE ORDER", coffeeLines, customerName, customerNote)
    : null;
  const pubSmsBody = pubLines.length
    ? orderText("BOTTLE SHOP ORDER", pubLines, customerName, customerNote)
    : null;

  return {
    order,
    products: store.products.filter((p) => p.active),
    smsBody: [coffeeSmsBody, pubSmsBody].filter(Boolean).join("\n\n"),
    coffeeSmsBody,
    pubSmsBody,
  };
}

export type CoffeeOrderForReply = {
  id: string;
  createdAt: string;
  customerName: string;
  customerNote: string;
  customerId?: string;
  status: BottleOrder["status"];
  pubReply: string;
  lines: string[];
};

/** Recent coffee reserves for the van. One store read, newest first. */
export async function listCoffeeOrdersForReply(limit = 15): Promise<CoffeeOrderForReply[]> {
  const store = await readStore();
  const out: CoffeeOrderForReply[] = [];
  const recent = store.orders.slice(-80).reverse();
  for (const order of recent) {
    if (order.status === "cancelled") continue;
    const lines = order.lines.filter((line) => line.category === "coffee");
    if (!lines.length) continue;
    out.push({
      id: order.id,
      createdAt: order.createdAt,
      customerName: order.customerName,
      customerNote: order.customerNote,
      customerId: order.customerId,
      status: order.status,
      pubReply: String(order.pubReply || ""),
      lines: lines.map((line) => `${line.quantity}× ${line.name}`),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function isCoffeeOrder(id: string): Promise<boolean> {
  const orderId = String(id || "").trim();
  if (!orderId.startsWith("ord-")) return false;
  const store = await readStore();
  const order = store.orders.find((item) => item.id === orderId);
  return Boolean(order && order.lines.some((line) => line.category === "coffee"));
}

/** Reply text for one coffee order. Empty when there is no reply. */
export async function getCoffeeOrderReply(id: string): Promise<string> {
  const orderId = String(id || "").trim();
  if (!orderId.startsWith("ord-")) return "";
  const store = await readStore();
  const order = store.orders.find((item) => item.id === orderId);
  if (!order || !order.lines.some((line) => line.category === "coffee")) return "";
  return String(order.pubReply || "").trim();
}

export async function replyToBottleOrder(
  id: string,
  reply: string
): Promise<BottleOrder> {
  const text = String(reply || "").trim().replace(/\s+/g, " ").slice(0, 240);
  if (!text) throw new Error("Enter a reply");
  const store = await readStore();
  const idx = store.orders.findIndex((o) => o.id === id);
  if (idx < 0) throw new Error("Order not found");
  const current = store.orders[idx];
  store.orders[idx] = {
    ...current,
    pubReply: text,
    pubReplyAt: new Date().toISOString(),
  };
  await writeStore(store);
  return store.orders[idx];
}

export type BottleShopReply = {
  id: string;
  pubReply: string;
  pubReplyAt: string;
  lines: string[];
};

/** Replies for one restored customer. One owner's bottle shop file. */
export async function listBottleRepliesForCustomer(
  customerId: string
): Promise<BottleShopReply[]> {
  const id = String(customerId || "").trim().toLowerCase();
  if (!id) return [];
  const store = await readStore();
  return store.orders
    .filter(
      (order) =>
        String(order.customerId || "").trim().toLowerCase() === id &&
        String(order.pubReply || "").trim()
    )
    .sort((a, b) => String(b.pubReplyAt || "").localeCompare(String(a.pubReplyAt || "")))
    .slice(0, 8)
    .map((order) => ({
      id: order.id,
      pubReply: String(order.pubReply || ""),
      pubReplyAt: String(order.pubReplyAt || order.createdAt),
      lines: order.lines.map((line) => `${line.quantity}× ${line.name}`),
    }));
}

export async function setBottleOrderStatus(
  id: string,
  status: BottleOrder["status"]
): Promise<BottleOrder> {
  const store = await readStore();
  const idx = store.orders.findIndex((o) => o.id === id);
  if (idx < 0) throw new Error("Order not found");
  const current = store.orders[idx];
  // Restock once when moving reserved → cancelled.
  if (current.status === "reserved" && status === "cancelled") {
    for (const line of current.lines) {
      if (line.category === "coffee") continue;
      const product = store.products.find((p) => p.id === line.productId);
      if (product) product.quantity += line.quantity;
    }
  }
  store.orders[idx] = { ...current, status };
  await writeStore(store);
  return store.orders[idx];
}

/** Remove an order from the ledger. Restocks if it was still reserved. */
export async function deleteBottleOrder(id: string): Promise<void> {
  const store = await readStore();
  const idx = store.orders.findIndex((o) => o.id === id);
  if (idx < 0) throw new Error("Order not found");
  const current = store.orders[idx];
  if (current.status === "reserved") {
    for (const line of current.lines) {
      if (line.category === "coffee") continue;
      const product = store.products.find((p) => p.id === line.productId);
      if (product) product.quantity += line.quantity;
    }
  }
  store.orders.splice(idx, 1);
  await writeStore(store);
}

/** Point coffee orders and bottle-shop logins at a renamed username. One file. */
export async function renameBottleShopLogin(fromEmail: string, toEmail: string): Promise<void> {
  const from = String(fromEmail || "").trim().toLowerCase();
  const to = String(toEmail || "").trim().toLowerCase();
  if (!from || !to || from === to) return;
  const store = await readStore();
  let changed = false;
  for (const order of store.orders) {
    if (String(order.customerId || "").trim().toLowerCase() === from) {
      order.customerId = to;
      changed = true;
    }
  }
  for (const customer of store.customers) {
    if (String(customer.login || "").trim().toLowerCase() === from) {
      customer.login = to;
      changed = true;
    }
  }
  if (changed) await writeStore(store);
}
