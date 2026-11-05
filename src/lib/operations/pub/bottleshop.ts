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
  lines: BottleOrderLine[];
  total: number;
  status: "reserved" | "collected" | "cancelled";
};

type BottleShopStore = {
  products: BottleProduct[];
  orders: BottleOrder[];
};

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function defaultStore(): BottleShopStore {
  return { products: [], orders: [] };
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
    return { products, orders };
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

export async function loadBottleShopAdmin() {
  const store = await readStore();
  return {
    products: store.products,
    orders: [...store.orders].reverse().slice(0, 100),
  };
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
  const customerName = String(input.customerName || "").trim() || "Customer";
  const customerNote = String(input.customerNote || "").trim();
  const order: BottleOrder = {
    id: newId("ord"),
    createdAt: new Date().toISOString(),
    customerName,
    customerNote,
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
