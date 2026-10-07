import { readBankAccounts, readLedger, writeLedger, type LedgerEntry } from "@/lib/accounting/store";
import { repairJournalEntries } from "@/lib/accounting/journalRepair";
import {
  applyDoubleEntry,
  retargetAllocatedDeposits,
  DOUBLE_ENTRY_FROM,
  type DoubleEntryLine,
} from "@/lib/accounting/doubleEntry";
import { readInvoices, tryAllocateLedgerDepositToInvoice } from "@/lib/accounting/invoices";
import { toIsoDateInput } from "@/lib/accounting/dates";

function allocatedByLedgerId(
  invoices: Array<{ payments?: Array<{ amount?: number; ledgerEntryIds?: string[] }> }>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const invoice of invoices) {
    for (const payment of invoice.payments || []) {
      const amount = Number(payment.amount) || 0;
      if (amount <= 0) continue;
      for (const id of payment.ledgerEntryIds || []) {
        const key = String(id || "").trim();
        if (!key) continue;
        out[key] = Math.round(((out[key] || 0) + amount) * 100) / 100;
      }
    }
  }
  return out;
}

/**
 * Repair, allocate invoice instalments, then balance every bank line
 * from 1 July 2026. Safe to run more than once.
 */
export async function ensureFy26DoubleEntry(): Promise<LedgerEntry[]> {
  const original = await readLedger();
  const repaired = repairJournalEntries(original);
  let entries = repaired.entries;

  for (const entry of entries) {
    if (String(entry.source || "") !== "bank-import") continue;
    if (entry.journalRole) continue;
    if ((Number(entry.amount) || 0) <= 0) continue;
    const day = toIsoDateInput(entry.date);
    if (!day || day < DOUBLE_ENTRY_FROM) continue;
    await tryAllocateLedgerDepositToInvoice(entry);
  }

  const [banks, invoices] = await Promise.all([readBankAccounts(), readInvoices()]);
  const converted = applyDoubleEntry(entries as DoubleEntryLine[], {
    banks,
    allocatedByLedgerId: allocatedByLedgerId(invoices),
  });
  const retargeted = retargetAllocatedDeposits(
    converted.entries,
    allocatedByLedgerId(invoices)
  );
  const changed = repaired.changed || converted.changed || retargeted.changed;
  const next = retargeted.entries as LedgerEntry[];
  if (changed) await writeLedger(next);
  return next;
}
