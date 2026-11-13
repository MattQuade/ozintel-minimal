import { promises as fs } from "fs";
import {
  getCashbookSandboxDir,
  getCashbookSandboxMiscPaymentsPath,
} from "@/lib/dataPaths";
import { sydneyTodayIso } from "@/lib/cashbookSandbox/sydneyDate";

export type CashbookSandboxMiscPayment = {
  id: string;
  /** Who was paid, e.g. CUB. */
  payee: string;
  amount: number;
  /** Sydney day the payment was entered. */
  date: string;
  createdAt: string;
};

type MiscStore = {
  payments: CashbookSandboxMiscPayment[];
};

function emptyStore(): MiscStore {
  return { payments: [] };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function ensureStore(): Promise<void> {
  await fs.mkdir(getCashbookSandboxDir(), { recursive: true });
  try {
    await fs.access(getCashbookSandboxMiscPaymentsPath());
  } catch {
    await fs.writeFile(
      getCashbookSandboxMiscPaymentsPath(),
      JSON.stringify(emptyStore(), null, 2),
      "utf8"
    );
  }
}

async function readStore(): Promise<MiscStore> {
  await ensureStore();
  try {
    const raw = await fs.readFile(getCashbookSandboxMiscPaymentsPath(), "utf8");
    const parsed = JSON.parse(raw || "{}") as MiscStore;
    if (!Array.isArray(parsed?.payments)) return emptyStore();
    return { payments: parsed.payments };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: MiscStore): Promise<void> {
  await ensureStore();
  await fs.writeFile(
    getCashbookSandboxMiscPaymentsPath(),
    JSON.stringify(store, null, 2),
    "utf8"
  );
}

export async function listSandboxMiscPayments(): Promise<
  CashbookSandboxMiscPayment[]
> {
  const store = await readStore();
  return [...store.payments].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

/** Append one payment. Practice sandbox only. */
export async function addSandboxMiscPayment(input: {
  payee: unknown;
  amount: unknown;
}): Promise<CashbookSandboxMiscPayment | null> {
  const payee = String(input.payee || "").trim().slice(0, 80);
  const amount = round2(Number(input.amount));
  if (!payee || !Number.isFinite(amount) || amount <= 0) return null;
  const payment: CashbookSandboxMiscPayment = {
    id: `mp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    payee,
    amount,
    date: sydneyTodayIso(),
    createdAt: new Date().toISOString(),
  };
  const store = await readStore();
  store.payments.push(payment);
  await writeStore(store);
  return payment;
}

export async function removeSandboxMiscPayment(id: string): Promise<boolean> {
  const key = String(id || "").trim();
  if (!key) return false;
  const store = await readStore();
  const next = store.payments.filter((row) => row.id !== key);
  if (next.length === store.payments.length) return false;
  store.payments = next;
  await writeStore(store);
  return true;
}
