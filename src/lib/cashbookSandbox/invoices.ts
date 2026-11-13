import { promises as fs } from "fs";
import {
  getCashbookSandboxDir,
  getCashbookSandboxInvoicesPath,
} from "@/lib/dataPaths";
import { sydneyTodayIso } from "@/lib/cashbookSandbox/sydneyDate";

export type CashbookSandboxInvoice = {
  id: string;
  /** Keg wholesale customer who paid. */
  customer: string;
  amount: number;
  /** Sydney day the invoice was entered. */
  date: string;
  createdAt: string;
};

type InvoiceStore = {
  invoices: CashbookSandboxInvoice[];
};

function emptyStore(): InvoiceStore {
  return { invoices: [] };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function ensureStore(): Promise<void> {
  await fs.mkdir(getCashbookSandboxDir(), { recursive: true });
  try {
    await fs.access(getCashbookSandboxInvoicesPath());
  } catch {
    await fs.writeFile(
      getCashbookSandboxInvoicesPath(),
      JSON.stringify(emptyStore(), null, 2),
      "utf8"
    );
  }
}

async function readStore(): Promise<InvoiceStore> {
  await ensureStore();
  try {
    const raw = await fs.readFile(getCashbookSandboxInvoicesPath(), "utf8");
    const parsed = JSON.parse(raw || "{}") as InvoiceStore;
    if (!Array.isArray(parsed?.invoices)) return emptyStore();
    return { invoices: parsed.invoices };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: InvoiceStore): Promise<void> {
  await ensureStore();
  await fs.writeFile(
    getCashbookSandboxInvoicesPath(),
    JSON.stringify(store, null, 2),
    "utf8"
  );
}

export async function listSandboxInvoices(): Promise<CashbookSandboxInvoice[]> {
  const store = await readStore();
  return [...store.invoices].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

/** Append one wholesale invoice payment. Practice sandbox only. */
export async function addSandboxInvoice(input: {
  customer: unknown;
  amount: unknown;
}): Promise<CashbookSandboxInvoice | null> {
  const customer = String(input.customer || "").trim().slice(0, 80);
  const amount = round2(Number(input.amount));
  if (!customer || !Number.isFinite(amount) || amount <= 0) return null;
  const invoice: CashbookSandboxInvoice = {
    id: `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    customer,
    amount,
    date: sydneyTodayIso(),
    createdAt: new Date().toISOString(),
  };
  const store = await readStore();
  store.invoices.push(invoice);
  await writeStore(store);
  return invoice;
}

export async function removeSandboxInvoice(id: string): Promise<boolean> {
  const key = String(id || "").trim();
  if (!key) return false;
  const store = await readStore();
  const next = store.invoices.filter((row) => row.id !== key);
  if (next.length === store.invoices.length) return false;
  store.invoices = next;
  await writeStore(store);
  return true;
}
