/**
 * Balanced journals for bank lines from 1 July 2026 onward.
 * A deposit debits the bank and credits income (or Accounts Receivable).
 * A payment credits the bank and debits the expense. GST, when it applies,
 * is its own line. Supplier bills stay on a cash basis: no Accounts Payable.
 * Years before 2026-07-01 are left as they are.
 */

import { round2 } from "@/lib/accounting/invoiceMath";
import { toIsoDateInput } from "@/lib/accounting/dates";
import type { BankAccount } from "@/lib/accounting/store";

export const DOUBLE_ENTRY_FROM = "2026-07-01";
export const GST_ACCOUNT_CODE = "820";
export const GST_ACCOUNT_NAME = "GST";
export const AR_ACCOUNT_CODE = "2101";
export const AR_ACCOUNT_NAME = "Accounts Receivable";

export type JournalRole = "bank" | "gst" | "account" | "ar";

export type DoubleEntryLine = {
  id: string;
  date?: string;
  description?: string;
  amount?: number;
  type?: string;
  account?: string;
  accountCode?: string;
  accountName?: string;
  bankAccountId?: string;
  bankAccountName?: string;
  source?: string;
  journalRef?: string;
  journalRole?: JournalRole;
  displayAmount?: number;
  noGST?: boolean;
  hasGST?: boolean;
  gstAmount?: number;
  taxCode?: string;
  gstExclusive?: boolean;
  amountIncludesGst?: boolean;
  receiptIds?: string[];
  reconciled?: boolean;
  [key: string]: unknown;
};

const SKIP_SOURCES = new Set([
  "invoice",
  "invoice-payment",
  "invoice-void",
  "payroll",
  "depreciation",
  "asset-disposal",
  "journal",
  "bank-journal",
]);

export function chartCodeForBank(bank: { id: string; name?: string }): string {
  if (bank.id === "3") return "2030";
  if (bank.id === "2010" || bank.id === "2020" || bank.id === "2030") return bank.id;
  const name = String(bank.name || "");
  if (/anz/i.test(name)) return "2030";
  if (/4091/.test(name)) return "2020";
  if (/credit card|9497|3436/i.test(name)) return "2010";
  return bank.id;
}

export function isJournalLeg(entry: { journalRole?: unknown; source?: unknown }): boolean {
  const role = String(entry.journalRole || "");
  return (
    role === "bank" ||
    role === "gst" ||
    role === "account" ||
    role === "ar" ||
    String(entry.source || "") === "bank-journal"
  );
}

function bankForLine(
  entry: DoubleEntryLine,
  banks: BankAccount[]
): BankAccount | undefined {
  const id = String(entry.bankAccountId || "").trim();
  if (id) {
    const hit = banks.find((bank) => bank.id === id);
    if (hit) return hit;
  }
  const name = String(entry.bankAccountName || "").trim();
  if (name) {
    const hit = banks.find((bank) => bank.name.trim().toLowerCase() === name.toLowerCase());
    if (hit) return hit;
  }
  // The line already names its bank. Still balance it when the account list
  // is empty or uses a different id.
  if (!id && !name) return undefined;
  return {
    id: id || name,
    name: name || id,
    accountNumber: "",
    bsb: "",
    openingBalance: 0,
    openingAsAt: "",
    type: "Cheque",
  };
}

function gstOnGross(entry: DoubleEntryLine, grossAbs: number): number {
  if (grossAbs < 0.005) return 0;
  if (entry.noGST === true) return 0;
  const code = String(entry.accountCode || "");
  if (code === AR_ACCOUNT_CODE || code === GST_ACCOUNT_CODE) return 0;
  const type = String(entry.type || "");
  if (type !== "Revenue" && type !== "Expense") return 0;
  const stored = Number(entry.gstAmount);
  if (Number.isFinite(stored) && stored > 0.004) {
    return round2(Math.min(Math.abs(stored), grossAbs));
  }
  if (entry.hasGST === false || entry.taxCode === "N-T" || entry.taxCode === "FRE") {
    return 0;
  }
  return round2(grossAbs - grossAbs / 1.1);
}

function needsExpand(entry: DoubleEntryLine, from: string, banks: BankAccount[]): boolean {
  if (isJournalLeg(entry)) return false;
  const source = String(entry.source || "");
  if (SKIP_SOURCES.has(source)) return false;
  if (source && source !== "bank-import") return false;
  const day = toIsoDateInput(entry.date);
  if (!day || day < from) return false;
  if (!bankForLine(entry, banks)) return false;
  const code = String(entry.accountCode || "");
  const bank = bankForLine(entry, banks);
  if (bank && code === chartCodeForBank(bank)) return false;
  return true;
}

/**
 * Replace one bank-import line with a balanced set.
 * The original id stays on the account the user sees in the journal.
 * `allocated` is the invoice payment already recorded against that id.
 * When it equals the deposit, the credit is Accounts Receivable, not income.
 */
export function expandBankLine(
  entry: DoubleEntryLine,
  banks: BankAccount[],
  allocated = 0
): DoubleEntryLine[] | null {
  const bank = bankForLine(entry, banks);
  if (!bank) return null;
  const gross = round2(Number(entry.amount) || 0);
  if (Math.abs(gross) < 0.005) return null;
  const grossAbs = round2(Math.abs(gross));
  const applied =
    gross > 0 ? round2(Math.min(grossAbs, Math.max(0, allocated))) : 0;
  const toReceivable = applied > 0.009 && Math.abs(applied - grossAbs) <= 0.02;
  const gst = toReceivable ? 0 : gstOnGross(entry, grossAbs);
  const netAbs = round2(grossAbs - gst);
  const journalRef = `DE-${entry.id}`;
  const bankCode = chartCodeForBank(bank);
  const bankAmount = gross;
  const gstAmount = gross < 0 ? gst : round2(-gst);

  const bankLeg: DoubleEntryLine = {
    id: `${entry.id}-bank`,
    date: entry.date,
    description: entry.description,
    amount: bankAmount,
    type: "Asset",
    accountCode: bankCode,
    accountName: bank.name,
    account: `${bankCode} - ${bank.name}`,
    bankAccountId: bank.id,
    bankAccountName: bank.name,
    source: "bank-journal",
    journalRef,
    journalRole: "bank",
    noGST: true,
    hasGST: false,
    gstAmount: 0,
    taxCode: "N-T",
    reconciled: entry.reconciled,
    timestamp: entry.timestamp,
  };

  const legs: DoubleEntryLine[] = [bankLeg];

  if (gst > 0.004) {
    legs.push({
      id: `${entry.id}-gst`,
      date: entry.date,
      description: entry.description,
      amount: gstAmount,
      type: "Liability",
      accountCode: GST_ACCOUNT_CODE,
      accountName: GST_ACCOUNT_NAME,
      account: `${GST_ACCOUNT_CODE} - ${GST_ACCOUNT_NAME}`,
      source: "bank-journal",
      journalRef,
      journalRole: "gst",
      noGST: true,
      hasGST: false,
      gstAmount: 0,
      taxCode: "N-T",
      reconciled: entry.reconciled,
      timestamp: entry.timestamp,
    });
  }

  if (toReceivable) {
    legs.push({
      ...entry,
      amount: round2(-gross),
      type: "Asset",
      accountCode: AR_ACCOUNT_CODE,
      accountName: AR_ACCOUNT_NAME,
      account: `${AR_ACCOUNT_CODE} - ${AR_ACCOUNT_NAME}`,
      bankAccountId: undefined,
      bankAccountName: undefined,
      source: "bank-import",
      journalRef,
      journalRole: "ar",
      displayAmount: gross,
      noGST: true,
      hasGST: false,
      gstAmount: 0,
      taxCode: "N-T",
      gstExclusive: false,
      amountIncludesGst: false,
    });
    return legs;
  }

  const accountAmount = gross < 0 ? netAbs : round2(-netAbs);
  legs.push({
    ...entry,
    amount: accountAmount,
    bankAccountId: undefined,
    bankAccountName: undefined,
    source: "bank-import",
    journalRef,
    journalRole: "account",
    displayAmount: gross,
    noGST: gst <= 0.004,
    hasGST: gst > 0.004,
    gstAmount: gst,
    taxCode: gst > 0.004 ? String(entry.taxCode || "GST") : "N-T",
    gstExclusive: gst > 0.004,
    amountIncludesGst: false,
  });
  return legs;
}

/** A deposit already split to income is moved to Accounts Receivable once it pays an invoice. */
export function retargetAllocatedDeposits<T extends DoubleEntryLine>(
  entries: T[],
  allocatedByLedgerId: Record<string, number>
): { entries: T[]; changed: boolean } {
  const drop = new Set<string>();
  const next = entries.map((entry) => {
    if (entry.journalRole !== "account") return entry;
    const gross = round2(Number(entry.displayAmount) || 0);
    if (gross <= 0.009) return entry;
    const applied = round2(Number(allocatedByLedgerId[entry.id]) || 0);
    if (Math.abs(applied - gross) > 0.02) return entry;
    const ref = String(entry.journalRef || "");
    if (ref) {
      for (const other of entries) {
        if (other.journalRef === ref && other.journalRole === "gst") drop.add(other.id);
      }
    }
    return {
      ...entry,
      amount: round2(-gross),
      type: "Asset",
      accountCode: AR_ACCOUNT_CODE,
      accountName: AR_ACCOUNT_NAME,
      account: `${AR_ACCOUNT_CODE} - ${AR_ACCOUNT_NAME}`,
      journalRole: "ar" as const,
      noGST: true,
      hasGST: false,
      gstAmount: 0,
      taxCode: "N-T",
      gstExclusive: false,
      amountIncludesGst: false,
    };
  });
  if (drop.size === 0 && next.every((entry, i) => entry === entries[i])) {
    return { entries, changed: false };
  }
  return {
    changed: true,
    entries: next.filter((entry) => !drop.has(entry.id)),
  };
}

export function journalSumsToZero(lines: Array<{ amount?: number }>): boolean {
  const total = round2(lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0));
  return Math.abs(total) <= 0.02;
}

export function applyDoubleEntry<T extends DoubleEntryLine>(
  entries: T[],
  opts: {
    from?: string;
    banks: BankAccount[];
    /** Invoice payments already recorded against a ledger line id. */
    allocatedByLedgerId?: Record<string, number>;
  }
): { entries: T[]; changed: boolean; converted: number } {
  const from = opts.from || DOUBLE_ENTRY_FROM;
  const allocated = opts.allocatedByLedgerId || {};
  let changed = false;
  let converted = 0;
  const next: T[] = [];
  for (const entry of entries) {
    if (!needsExpand(entry, from, opts.banks)) {
      next.push(entry);
      continue;
    }
    const legs = expandBankLine(entry, opts.banks, Number(allocated[entry.id]) || 0);
    if (!legs || !journalSumsToZero(legs)) {
      next.push(entry);
      continue;
    }
    changed = true;
    converted += 1;
    for (const leg of legs) next.push(leg as T);
  }
  return { entries: next, changed, converted };
}

/** Ids in the same balanced journal as any id being deleted. */
export function idsWithJournalGroup(
  entries: Array<{ id: string; journalRef?: string }>,
  ids: string[]
): string[] {
  const want = new Set(ids.map((id) => String(id || "").trim()).filter(Boolean));
  const refs = new Set<string>();
  for (const entry of entries) {
    const ref = String(entry.journalRef || "");
    if (want.has(entry.id) && ref.startsWith("DE-")) refs.add(ref);
  }
  const out = new Set(want);
  for (const entry of entries) {
    const ref = String(entry.journalRef || "");
    if (ref && refs.has(ref)) out.add(entry.id);
  }
  return [...out];
}
