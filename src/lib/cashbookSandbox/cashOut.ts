import { promises as fs } from "fs";
import {
  getCashbookSandboxCashOutPath,
  getCashbookSandboxDir,
} from "@/lib/dataPaths";

export type CashbookSandboxCashOut = {
  receiptId: string;
  /** YYYY-MM-DD from the receipt date, else the snap day. */
  date: string;
  /** Printed total. GST is not stripped. */
  amount: number;
  snappedAt: string;
};

type CashOutStore = {
  entries: CashbookSandboxCashOut[];
};

function emptyStore(): CashOutStore {
  return { entries: [] };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function ensureStore(): Promise<void> {
  await fs.mkdir(getCashbookSandboxDir(), { recursive: true });
  try {
    await fs.access(getCashbookSandboxCashOutPath());
  } catch {
    await fs.writeFile(
      getCashbookSandboxCashOutPath(),
      JSON.stringify(emptyStore(), null, 2),
      "utf8"
    );
  }
}

async function readStore(): Promise<CashOutStore> {
  await ensureStore();
  try {
    const raw = await fs.readFile(getCashbookSandboxCashOutPath(), "utf8");
    const parsed = JSON.parse(raw || "{}") as CashOutStore;
    if (!Array.isArray(parsed?.entries)) return emptyStore();
    return { entries: parsed.entries };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: CashOutStore): Promise<void> {
  await ensureStore();
  await fs.writeFile(
    getCashbookSandboxCashOutPath(),
    JSON.stringify(store, null, 2),
    "utf8"
  );
}

export async function listSandboxCashOuts(): Promise<CashbookSandboxCashOut[]> {
  const store = await readStore();
  return store.entries;
}

/** One row per receipt. A later snap of the same receipt replaces the amount. */
export async function upsertSandboxCashOut(
  input: CashbookSandboxCashOut
): Promise<void> {
  const receiptId = String(input.receiptId || "").trim();
  const date = String(input.date || "").slice(0, 10);
  const amount = round2(Number(input.amount));
  if (!receiptId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  if (!Number.isFinite(amount) || amount <= 0) return;

  const store = await readStore();
  const next: CashbookSandboxCashOut = {
    receiptId,
    date,
    amount,
    snappedAt: input.snappedAt || new Date().toISOString(),
  };
  const idx = store.entries.findIndex((row) => row.receiptId === receiptId);
  if (idx >= 0) store.entries[idx] = next;
  else store.entries.push(next);
  await writeStore(store);
}

export async function removeSandboxCashOut(receiptId: string): Promise<void> {
  const id = String(receiptId || "").trim();
  if (!id) return;
  const store = await readStore();
  const next = store.entries.filter((row) => row.receiptId !== id);
  if (next.length === store.entries.length) return;
  store.entries = next;
  await writeStore(store);
}
