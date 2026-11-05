import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import {
  getBottleShopFilePath,
  getBottleShopPhotosDir,
  getPubOpsDataDir,
  getRepoSeedBottleShopPath,
} from "@/lib/dataPaths";

export type BottleProduct = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  active: boolean;
};

export type BottleOrderLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type BottleOrder = {
  id: string;
  createdAt: string;
  customerName: string;
  customerNote: string;
  customerId?: string;
  lines: BottleOrderLine[];
  total: number;
  status: "reserved" | "collected" | "cancelled";
};

/** Manually added customers who may open /bottleshop with their access code. */
export type BottleCustomer = {
  id: string;
  name: string;
  /** Restore username on /bottleshop, e.g. tbong@ozintel */
  login: string;
  phone: string;
  note: string;
  accessCode: string;
  active: boolean;
  createdAt: string;
};

type BottleShopStore = {
  products: BottleProduct[];
  orders: BottleOrder[];
  customers: BottleCustomer[];
};

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function defaultStore(): BottleShopStore {
  return { products: [], orders: [], customers: [] };
}

function normalizeAccessCode(raw: string) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function makeAccessCode(existing: Set<string>) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    let code = "";
    for (let i = 0; i < 6; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!existing.has(code)) return code;
  }
  return `B${Date.now().toString(36).toUpperCase().slice(-5)}`;
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
  const accessCode = normalizeAccessCode(String(raw.accessCode || ""));
  if (!id || !name || accessCode.length < 4) return null;
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

function normalizeProduct(raw: Partial<BottleProduct>): BottleProduct | null {
  const id = String(raw.id || "").trim();
  const name = String(raw.name || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    price: Math.max(0, Number(raw.price) || 0),
    quantity: Math.max(0, Math.floor(Number(raw.quantity) || 0)),
    imageUrl: String(raw.imageUrl || `/bottleshop/${id}.svg`).trim(),
    active: raw.active !== false,
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

async function readStore(): Promise<BottleShopStore> {
  await ensureDirs();
  await maybeSeedFromRepo();
  try {
    const raw = await fs.readFile(getBottleShopFilePath(), "utf8");
    const parsed = JSON.parse(raw || "{}") as Partial<BottleShopStore>;
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
    return { products, orders, customers };
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
}): Promise<BottleProduct[]> {
  const store = await readStore();
  return store.products.filter((p) => {
    if (opts?.activeOnly && !p.active) return false;
    if (opts?.inStockOnly && p.quantity <= 0) return false;
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
    reservedCount: store.orders.filter((o) => o.status === "reserved").length,
  };
}

export async function findBottleCustomerByCode(
  accessCode: string
): Promise<BottleCustomer | null> {
  const code = normalizeAccessCode(accessCode);
  if (!code) return null;
  const store = await readStore();
  return (
    store.customers.find((c) => c.active && c.accessCode === code) || null
  );
}

/**
 * Match an active ledger customer by restore username, name, note, or phone.
 * Lets people already listed in the Bottle Shop ledger unlock via Restore.
 */
export async function findBottleCustomerForRestore(
  query: string
): Promise<BottleCustomer | null> {
  const q = normalizeLogin(query);
  if (!q) return null;
  const store = await readStore();
  const qPhone = q.replace(/\D/g, "");
  return (
    store.customers.find((c) => {
      if (!c.active) return false;
      const keys = [
        bottleCustomerLogin(c),
        normalizeLogin(c.name),
        normalizeLogin(c.note),
        normalizeLogin(c.phone),
      ].filter(Boolean);
      if (keys.includes(q)) return true;
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
  const store = await readStore();
  if (login) {
    const clash = store.customers.find(
      (c) => c.active && bottleCustomerLogin(c) === login
    );
    if (clash) {
      throw new Error(`Username ${login} is already used by ${clash.name}`);
    }
  }
  const existingCodes = new Set(store.customers.map((c) => c.accessCode));
  const customer: BottleCustomer = {
    id: newId("cust"),
    name,
    login,
    phone: String(input.phone || "").trim(),
    note: String(input.note || "").trim(),
    accessCode: makeAccessCode(existingCodes),
    active: true,
    createdAt: new Date().toISOString(),
  };
  store.customers.push(customer);
  await writeStore(store);

  if (login) {
    const { ensureApprovedBottleShopUser } = await import("@/lib/users");
    await ensureApprovedBottleShopUser({
      email: login,
      name,
      phone: customer.phone,
    });
  }

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
  const jpeg = await sharp(buffer)
    .rotate()
    .resize({
      width: 900,
      height: 1200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82 })
    .toBuffer();
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
  patch: Partial<Pick<BottleProduct, "name" | "price" | "quantity" | "imageUrl" | "active">>
): Promise<BottleProduct> {
  const store = await readStore();
  const idx = store.products.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error("Product not found");
  const current = store.products[idx];
  const next: BottleProduct = {
    ...current,
    name:
      patch.name != null ? String(patch.name).trim() || current.name : current.name,
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
  };
  store.products[idx] = next;
  await writeStore(store);
  return next;
}

export type PlaceOrderInput = {
  items: Array<{ productId: string; quantity: number }>;
  customerName?: string;
  customerNote?: string;
  accessCode?: string;
};

export type PlaceOrderResult = {
  order: BottleOrder;
  products: BottleProduct[];
  smsBody: string;
};

export async function placeBottleOrder(
  input: PlaceOrderInput
): Promise<PlaceOrderResult> {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throw new Error("Select at least one bottle");

  const wanted = new Map<string, number>();
  for (const item of items) {
    const productId = String(item.productId || "").trim();
    const quantity = Math.floor(Number(item.quantity) || 0);
    if (!productId || quantity <= 0) continue;
    wanted.set(productId, (wanted.get(productId) || 0) + quantity);
  }
  if (!wanted.size) throw new Error("Select at least one bottle");

  const store = await readStore();
  const lines: BottleOrderLine[] = [];

  for (const [productId, quantity] of wanted) {
    const product = store.products.find((p) => p.id === productId && p.active);
    if (!product) throw new Error(`Bottle not found: ${productId}`);
    if (product.quantity < quantity) {
      throw new Error(
        `Only ${product.quantity} left of ${product.name} (requested ${quantity})`
      );
    }
    product.quantity -= quantity;
    lines.push({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice: product.price,
    });
  }

  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const linked = input.accessCode
    ? await findBottleCustomerByCode(input.accessCode)
    : null;
  if (input.accessCode && !linked) {
    throw new Error("Invalid or inactive bottle shop access code");
  }
  const customerName =
    String(input.customerName || "").trim() || linked?.name || "Customer";
  const customerNote = String(input.customerNote || "").trim();
  const order: BottleOrder = {
    id: newId("ord"),
    createdAt: new Date().toISOString(),
    customerName,
    customerNote,
    customerId: linked?.id,
    lines,
    total,
    status: "reserved",
  };
  store.orders.push(order);
  await writeStore(store);

  const lineText = lines
    .map((l) => `${l.quantity}x ${l.name}`)
    .join(", ");
  const smsBody = [
    "BOTTLE SHOP ORDER",
    lineText,
    `Total: $${total.toFixed(2)}`,
    `Name: ${customerName}`,
    customerNote ? `Note: ${customerNote}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    order,
    products: store.products.filter((p) => p.active),
    smsBody,
  };
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
      const product = store.products.find((p) => p.id === line.productId);
      if (product) product.quantity += line.quantity;
    }
  }
  store.orders[idx] = { ...current, status };
  await writeStore(store);
  return store.orders[idx];
}
