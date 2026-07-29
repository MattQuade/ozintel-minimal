import { promises as fs } from "fs";
import { getKegsFilePath, getPubOpsDataDir } from "@/lib/dataPaths";

export type KegTotals = {
  totalIn: number;
  totalOut: number;
  net: number;
};

type KegStore = {
  totalIn: number;
  totalOut: number;
};

const EMPTY: KegStore = { totalIn: 0, totalOut: 0 };

async function ensureStore() {
  await fs.mkdir(getPubOpsDataDir(), { recursive: true });
  const file = getKegsFilePath();
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, JSON.stringify(EMPTY, null, 2), "utf8");
  }
}

async function readStore(): Promise<KegStore> {
  await ensureStore();
  const raw = await fs.readFile(getKegsFilePath(), "utf8");
  const parsed = JSON.parse(raw || "{}") as Partial<KegStore>;
  return {
    totalIn: Number(parsed.totalIn) || 0,
    totalOut: Number(parsed.totalOut) || 0,
  };
}

async function writeStore(store: KegStore) {
  await ensureStore();
  await fs.writeFile(getKegsFilePath(), JSON.stringify(store, null, 2), "utf8");
}

function toTotals(store: KegStore): KegTotals {
  return {
    totalIn: store.totalIn,
    totalOut: store.totalOut,
    net: store.totalIn - store.totalOut,
  };
}

export async function getKegTotals(): Promise<KegTotals> {
  return toTotals(await readStore());
}

export async function addKegsIn(quantity: number): Promise<KegTotals> {
  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Quantity must be a positive number");
  }
  const store = await readStore();
  store.totalIn += qty;
  await writeStore(store);
  return toTotals(store);
}

export async function addKegsOut(quantity: number): Promise<KegTotals> {
  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Quantity must be a positive number");
  }
  const store = await readStore();
  store.totalOut += qty;
  await writeStore(store);
  return toTotals(store);
}
