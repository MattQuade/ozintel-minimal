import { promises as fs } from "fs";
import {
  getAccountingDataDir,
  getCustomersFilePath,
} from "@/lib/dataPaths";

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  billingAddress: string;
  abn: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

let customersChain: Promise<unknown> = Promise.resolve();
function withCustomersLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = customersChain.then(fn, fn);
  customersChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function ensureDir() {
  await fs.mkdir(getAccountingDataDir(), { recursive: true });
}

async function writeCustomersUnlocked(customers: Customer[]) {
  await ensureDir();
  const target = getCustomersFilePath();
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(customers, null, 2), "utf8");
  try {
    await fs.rename(tmp, target);
  } catch {
    await fs.copyFile(tmp, target);
    await fs.unlink(tmp).catch(() => undefined);
  }
}

async function readCustomersUnlocked(): Promise<Customer[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(getCustomersFilePath(), "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as Customer[]) : [];
  } catch {
    await writeCustomersUnlocked([]);
    return [];
  }
}

export async function readCustomers(): Promise<Customer[]> {
  return readCustomersUnlocked();
}

export async function writeCustomers(customers: Customer[]): Promise<void> {
  return withCustomersLock(() => writeCustomersUnlocked(customers));
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const customers = await readCustomersUnlocked();
  return customers.find((c) => c.id === id) || null;
}

function normalizeCustomer(
  input: Partial<Customer>,
  existing?: Customer
): Customer {
  const now = new Date().toISOString();
  const name = String(input.name || existing?.name || "").trim();
  if (!name) throw new Error("Customer name is required");
  return {
    id: String(input.id || existing?.id || `CUS-${Date.now()}`),
    name,
    email: String(input.email ?? existing?.email ?? "").trim(),
    phone: String(input.phone ?? existing?.phone ?? "").trim(),
    billingAddress: String(
      input.billingAddress ?? existing?.billingAddress ?? ""
    ).trim(),
    abn: String(input.abn ?? existing?.abn ?? "").trim(),
    notes: String(input.notes ?? existing?.notes ?? "").trim(),
    createdAt: existing?.createdAt || input.createdAt || now,
    updatedAt: now,
  };
}

export async function upsertCustomer(
  input: Partial<Customer>
): Promise<Customer> {
  return withCustomersLock(async () => {
    const customers = await readCustomersUnlocked();
    const id = input.id ? String(input.id) : "";
    const idx = id ? customers.findIndex((c) => c.id === id) : -1;
    const next = normalizeCustomer(
      input,
      idx >= 0 ? customers[idx] : undefined
    );
    if (idx >= 0) customers[idx] = next;
    else customers.push(next);
    await writeCustomersUnlocked(customers);
    return next;
  });
}

export async function deleteCustomer(id: string): Promise<boolean> {
  return withCustomersLock(async () => {
    const customers = await readCustomersUnlocked();
    const next = customers.filter((c) => c.id !== id);
    if (next.length === customers.length) return false;
    await writeCustomersUnlocked(next);
    return true;
  });
}
