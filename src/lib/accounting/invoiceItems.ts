import { promises as fs } from "fs";
import path from "path";
import { getInvoiceItemsFilePath } from "@/lib/dataPaths";
import { round2 } from "@/lib/accounting/invoiceMath";

export type InvoiceItem = {
  id: string;
  name: string;
  unitPrice: number;
  accountCode: string;
  accountName: string;
  hasGST: boolean;
  tracked: boolean;
  quantityOnHand: number;
};

export type ItemQuantityLine = {
  itemId?: string;
  quantity?: number;
};

let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readItems(): Promise<InvoiceItem[]> {
  try {
    const raw = await fs.readFile(getInvoiceItemsFilePath(), "utf8");
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed as InvoiceItem[];
  } catch {
    return [];
  }
}

async function writeItems(items: InvoiceItem[]) {
  const target = getInvoiceItemsFilePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(items, null, 2), "utf8");
}

export async function listInvoiceItems(): Promise<InvoiceItem[]> {
  const items = await readItems();
  return items.slice().sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveInvoiceItem(
  input: Partial<InvoiceItem> & { name: string }
): Promise<InvoiceItem> {
  return withLock(async () => {
    const items = await readItems();
    const name = String(input.name || "").trim();
    if (!name) throw new Error("Item name is required");
    const accountCode = String(input.accountCode || "").trim();
    if (!accountCode) throw new Error("Account is required");
    const id = String(input.id || "").trim();
    const idx = id ? items.findIndex((item) => item.id === id) : -1;
    const existing = idx >= 0 ? items[idx] : undefined;
    const tracked = Boolean(input.tracked);
    const next: InvoiceItem = {
      id: existing?.id || `item-${Date.now()}`,
      name,
      unitPrice: round2(Number(input.unitPrice) || 0),
      accountCode,
      accountName: String(input.accountName || "").trim(),
      hasGST: input.hasGST !== false,
      tracked,
      quantityOnHand: tracked
        ? round2(
            Number(
              input.quantityOnHand != null
                ? input.quantityOnHand
                : existing?.quantityOnHand || 0
            ) || 0
          )
        : 0,
    };
    if (idx >= 0) items[idx] = next;
    else items.push(next);
    await writeItems(items);
    return next;
  });
}

export async function deleteInvoiceItem(id: string): Promise<boolean> {
  return withLock(async () => {
    const items = await readItems();
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) return false;
    await writeItems(next);
    return true;
  });
}

/** direction -1 sells stock, +1 puts it back. Untracked items are skipped. */
export async function adjustItemQuantities(
  lines: ItemQuantityLine[],
  direction: -1 | 1
): Promise<void> {
  return withLock(async () => {
    const items = await readItems();
    if (items.length === 0) return;
    const byId = new Map(items.map((item) => [item.id, item]));
    let changed = false;
    for (const line of lines) {
      const id = String(line.itemId || "").trim();
      if (!id) continue;
      const item = byId.get(id);
      if (!item?.tracked) continue;
      const qty = Number(line.quantity) || 0;
      if (!qty) continue;
      item.quantityOnHand = round2(item.quantityOnHand + direction * qty);
      changed = true;
    }
    if (changed) await writeItems(items);
  });
}
