import { promises as fs } from "fs";
import {
  getAccountingDataDir,
  getAccountingRulesFilePath,
  getBankAccountsFilePath,
  getCoaFilePath,
  getEmployeesFilePath,
  getInvoicesFilePath,
  getLedgerFilePath,
  getPayRunsFilePath,
  getReceiptFilesDir,
  getReceiptsDir,
  getReceiptsMetaFilePath,
  getCustomersFilePath,
  getMerchantsFilePath,
  getRepoSeedCoaPath,
  getRepoSeedRulesPath,
} from "@/lib/dataPaths";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { APPROVED_RECEIPT_MERCHANTS } from "@/lib/accounting/approvedMerchants";
import { stampLedgerGstFields } from "@/lib/accounting/gstTax";
import { assertDatesUnlocked } from "@/lib/accounting/basPeriods";

export type CoaAccount = {
  code: string;
  name: string;
  type: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense" | string;
  isBank?: boolean;
  noGST?: boolean;
  isCapital?: boolean;
};

export type LedgerEntry = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: string;
  account?: string;
  accountCode?: string;
  accountName?: string;
  category?: string;
  bankAccountId?: string;
  bankAccountName?: string;
  source?: string;
  timestamp?: string;
  hasGST?: boolean;
  noGST?: boolean;
  /** GST | CAP | FRE | EXP | INP | N-T */
  taxCode?: string;
  gstAmount?: number;
  gstExclusive?: boolean;
  amountIncludesGst?: boolean;
  reconciled?: boolean;
  /** Receipt evidence ids stored under data/accounting/receipts/ */
  receiptIds?: string[];
  [key: string]: unknown;
};

export type BankRule = {
  id: number;
  name: string;
  matchValue: string;
  matchValues?: string[];
  matchField?: "description" | "amount" | "any" | "payee" | "reference" | string;
  matchType?: "contains" | "equals" | "startsWith" | string;
  /** Optional replacement description when the rule matches. */
  descriptionOverride?: string;
  /** When set, rule only applies to this bank account (e.g. NAB Business #4091 → "2020"). */
  bankAccountId?: string;
  direction?: "receive" | "spend" | "transfer" | "any" | string;
  accountCode: string;
  accountName: string;
  type: string;
  autoReconcile?: boolean;
  noGST?: boolean;
};

export type BankAccount = {
  id: string;
  name: string;
  accountNumber: string;
  bsb: string;
  openingBalance: number;
  openingAsAt: string;
  type: string;
};

async function ensureAccountingDir() {
  await fs.mkdir(getAccountingDataDir(), { recursive: true });
}

/** Create an empty JSON file if this owner's silo does not already have one. */
async function ensureJsonIfMissing(targetPath: string, contents: string) {
  try {
    await fs.access(targetPath);
    return;
  } catch {
    // missing
  }
  await ensureAccountingDir();
  await fs.writeFile(targetPath, contents, "utf8");
}

/**
 * Product chart only — never copy another user's live ledger, banks, or rules.
 */
async function seedCoaIfMissing() {
  const targetPath = getCoaFilePath();
  try {
    await fs.access(targetPath);
    return;
  } catch {
    // missing
  }
  await ensureAccountingDir();
  try {
    const seedRaw = await fs.readFile(getRepoSeedCoaPath(), "utf8");
    await fs.writeFile(targetPath, seedRaw, "utf8");
    console.log(`[accounting] Seeded COA template for ${targetPath}`);
  } catch {
    await fs.writeFile(targetPath, "[]", "utf8");
  }
}

/**
 * First-run files for one owner's accounting silo.
 * Live books (ledger, banks, rules, receipts, customers, invoices, payroll)
 * start empty. COA is a shared product template, not another user's data.
 */
export async function ensureOwnerAccountingSilo(ownerEmail: string): Promise<void> {
  await runWithDataOwnerAsync(ownerEmail, async () => {
    await ensureAccountingDir();
    await fs.mkdir(getReceiptsDir(), { recursive: true });
    await fs.mkdir(getReceiptFilesDir(), { recursive: true });
    await ensureJsonIfMissing(getLedgerFilePath(), "[]");
    await ensureJsonIfMissing(
      getAccountingRulesFilePath(),
      JSON.stringify({ rules: [] }, null, 2)
    );
    await ensureJsonIfMissing(getBankAccountsFilePath(), "[]");
    await ensureJsonIfMissing(getCustomersFilePath(), "[]");
    await ensureJsonIfMissing(getInvoicesFilePath(), "[]");
    await ensureJsonIfMissing(getEmployeesFilePath(), "[]");
    await ensureJsonIfMissing(getPayRunsFilePath(), "[]");
    await ensureJsonIfMissing(
      getReceiptsMetaFilePath(),
      JSON.stringify({ receipts: [] }, null, 2)
    );
    await ensureJsonIfMissing(
      getMerchantsFilePath(),
      JSON.stringify(APPROVED_RECEIPT_MERCHANTS, null, 2)
    );
    await seedCoaIfMissing();
  });
}

function ensureEntryId(entry: Record<string, unknown>, index: number): LedgerEntry {
  const existing = typeof entry.id === "string" ? entry.id.trim() : "";
  const id =
    existing ||
    `LE-${entry.timestamp || entry.date || "row"}-${index}-${Math.abs(
      Number(entry.amount) || 0
    )}`;
  return { ...entry, id } as LedgerEntry;
}

/** Serialize ledger mutations so concurrent Clear All / Save cannot corrupt JSON. */
let ledgerChain: Promise<unknown> = Promise.resolve();
function withLedgerLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = ledgerChain.then(fn, fn);
  ledgerChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Recover from truncated / double-written ledger files (concurrent writes). */
function parseLedgerRows(raw: string): unknown[] {
  const text = String(raw || "").trim() || "[]";
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Common corruption: two arrays concatenated `][` after overlapping writes
    const join = text.indexOf("]\n[");
    const joinAlt = join < 0 ? text.indexOf("][") : join;
    if (joinAlt > 0) {
      try {
        const parsed = JSON.parse(text.slice(0, joinAlt + 1));
        if (Array.isArray(parsed)) {
          console.warn(
            "[accounting] Recovered ledger.json from concatenated JSON arrays"
          );
          return parsed;
        }
      } catch {
        // continue
      }
    }

    const start = text.indexOf("[");
    if (start >= 0) {
      let depth = 0;
      for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (ch === "[") depth += 1;
        else if (ch === "]") {
          depth -= 1;
          if (depth === 0) {
            try {
              const parsed = JSON.parse(text.slice(start, i + 1));
              if (Array.isArray(parsed)) {
                console.warn(
                  "[accounting] Recovered ledger.json from first valid JSON array"
                );
                return parsed;
              }
            } catch {
              break;
            }
          }
        }
      }
    }

    console.error(
      "[accounting] ledger.json unreadable — starting empty (backup left on disk if present)"
    );
    return [];
  }
}

async function readLedgerUnlocked(): Promise<LedgerEntry[]> {
  await ensureJsonIfMissing(getLedgerFilePath(), "[]");
  const raw = await fs.readFile(getLedgerFilePath(), "utf8");
  const rows = parseLedgerRows(raw);
  return rows.map((row, index) =>
    ensureEntryId(
      row && typeof row === "object" ? (row as Record<string, unknown>) : {},
      index
    )
  );
}

async function writeLedgerUnlocked(entries: LedgerEntry[]) {
  await ensureAccountingDir();
  const target = getLedgerFilePath();
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(entries, null, 2);
  await fs.writeFile(tmp, payload, "utf8");
  try {
    await fs.rename(tmp, target);
  } catch {
    // Windows may refuse rename over an existing file
    await fs.copyFile(tmp, target);
    await fs.unlink(tmp).catch(() => undefined);
  }
}

export async function readLedger(): Promise<LedgerEntry[]> {
  return readLedgerUnlocked();
}

export async function writeLedger(entries: LedgerEntry[]) {
  return withLedgerLock(() => writeLedgerUnlocked(entries));
}

function stampIncomingEntries(
  incoming: Array<Partial<LedgerEntry>>,
  coa: CoaAccount[],
  startIndex: number
): LedgerEntry[] {
  return incoming.map((e, index) => {
    const receiptIds = Array.isArray(e.receiptIds)
      ? e.receiptIds.filter(
          (x): x is string => typeof x === "string" && Boolean(x.trim())
        )
      : undefined;
    const gst = stampLedgerGstFields(e, coa);
    return ensureEntryId(
      {
        ...e,
        taxCode: gst.taxCode,
        gstAmount: gst.gstAmount,
        noGST: gst.noGST,
        hasGST: gst.hasGST,
        amountIncludesGst: gst.amountIncludesGst,
        ...(receiptIds && receiptIds.length > 0 ? { receiptIds } : {}),
        timestamp: e.timestamp || new Date().toISOString(),
        id: e.id || `LE${Date.now()}-${index}`,
      },
      startIndex + index
    );
  });
}

export async function appendLedgerEntries(
  incoming: Array<Partial<LedgerEntry>>
): Promise<{
  saved: number;
  total: number;
  entries: LedgerEntry[];
  savedEntries: LedgerEntry[];
}> {
  return withLedgerLock(async () => {
    await assertDatesUnlocked(incoming.map((e) => String(e.date || "")));
    const coa = await readCoa();
    const ledger = await readLedgerUnlocked();
    const stamped = stampIncomingEntries(incoming, coa, ledger.length);
    const next = [...ledger, ...stamped];
    await writeLedgerUnlocked(next);
    return {
      saved: stamped.length,
      total: next.length,
      entries: next,
      savedEntries: stamped,
    };
  });
}

/**
 * Remove existing rows and append replacements in one write so an authorised
 * invoice edit cannot leave AR posted twice or not at all.
 */
export async function replaceLedgerEntries(
  removeIds: string[],
  incoming: Array<Partial<LedgerEntry>>
): Promise<{
  saved: number;
  total: number;
  entries: LedgerEntry[];
  savedEntries: LedgerEntry[];
  deleted: number;
}> {
  const idSet = new Set(
    removeIds.map((id) => String(id || "").trim()).filter(Boolean)
  );
  return withLedgerLock(async () => {
    const ledger = await readLedgerUnlocked();
    const toDelete = ledger.filter((e) => idSet.has(e.id));
    await assertDatesUnlocked([
      ...toDelete.map((e) => e.date),
      ...incoming.map((e) => String(e.date || "")),
    ]);
    const remaining = ledger.filter((e) => !idSet.has(e.id));
    const coa = await readCoa();
    const stamped = stampIncomingEntries(incoming, coa, remaining.length);
    const next = [...remaining, ...stamped];
    await writeLedgerUnlocked(next);
    return {
      saved: stamped.length,
      total: next.length,
      entries: next,
      savedEntries: stamped,
      deleted: toDelete.length,
    };
  });
}

export async function updateLedgerEntry(
  patch: Partial<LedgerEntry> & { id: string }
): Promise<LedgerEntry> {
  return withLedgerLock(async () => {
    const ledger = await readLedgerUnlocked();
    const idx = ledger.findIndex((e) => e.id === patch.id);
    if (idx < 0) throw new Error("Entry not found");
    const merged: LedgerEntry = {
      ...ledger[idx],
      ...patch,
      id: ledger[idx].id,
    };
    await assertDatesUnlocked([ledger[idx].date, merged.date]);
    const coa = await readCoa();
    const gst = stampLedgerGstFields(merged, coa);
    const updated: LedgerEntry = {
      ...merged,
      taxCode: gst.taxCode,
      gstAmount: gst.gstAmount,
      noGST: gst.noGST,
      hasGST: gst.hasGST,
      amountIncludesGst: gst.amountIncludesGst,
    };
    ledger[idx] = updated;
    await writeLedgerUnlocked(ledger);
    return updated;
  });
}

export async function deleteLedgerEntry(id: string): Promise<boolean> {
  const result = await deleteLedgerEntries([id]);
  return result > 0;
}

/** Delete many entries in one read/write (avoids corrupting ledger.json). */
export async function deleteLedgerEntries(ids: string[]): Promise<number> {
  const idSet = new Set(ids.map((id) => String(id || "").trim()).filter(Boolean));
  if (idSet.size === 0) return 0;
  return withLedgerLock(async () => {
    const ledger = await readLedgerUnlocked();
    const toDelete = ledger.filter((e) => idSet.has(e.id));
    await assertDatesUnlocked(toDelete.map((e) => e.date));
    const next = ledger.filter((e) => !idSet.has(e.id));
    const deleted = ledger.length - next.length;
    if (deleted > 0) await writeLedgerUnlocked(next);
    return deleted;
  });
}

export async function resetLedger() {
  return withLedgerLock(async () => {
    await assertDatesUnlocked(
      (await readLedgerUnlocked()).map((e) => e.date)
    );
    await writeLedgerUnlocked([]);
  });
}

export async function readCoa(): Promise<CoaAccount[]> {
  await seedCoaIfMissing();
  const raw = await fs.readFile(getCoaFilePath(), "utf8");
  const parsed = JSON.parse(raw || "[]");
  const existing: CoaAccount[] = Array.isArray(parsed) ? parsed : [];

  // Merge any missing seed accounts (recovers codes lost after localStorage era)
  let seedAccounts: CoaAccount[] = [];
  try {
    const seedRaw = await fs.readFile(getRepoSeedCoaPath(), "utf8");
    const seedParsed = JSON.parse(seedRaw || "[]");
    seedAccounts = Array.isArray(seedParsed) ? seedParsed : [];
  } catch {
    seedAccounts = [];
  }

  const byCode = new Map<string, CoaAccount>();
  for (const a of existing) {
    if (a?.code) byCode.set(String(a.code), a);
  }
  let added = 0;
  for (const s of seedAccounts) {
    if (!s?.code) continue;
    const code = String(s.code);
    if (!byCode.has(code)) {
      byCode.set(code, s);
      added += 1;
    }
  }

  const merged = [...byCode.values()].sort((a, b) =>
    String(a.code).localeCompare(String(b.code), undefined, { numeric: true })
  );
  if (added > 0) {
    await writeCoa(merged);
    console.log(`[accounting] Merged ${added} missing COA accounts from seed`);
  }
  return merged;
}

/** Replace live COA with the repo seed chart (full sync from Xero export). */
export async function syncCoaFromSeed(): Promise<{
  accounts: CoaAccount[];
  added: number;
  updated: number;
}> {
  let seedAccounts: CoaAccount[] = [];
  try {
    const seedRaw = await fs.readFile(getRepoSeedCoaPath(), "utf8");
    const seedParsed = JSON.parse(seedRaw || "[]");
    seedAccounts = Array.isArray(seedParsed) ? seedParsed : [];
  } catch {
    seedAccounts = [];
  }

  const existing = await readCoa();
  const accounts = [...seedAccounts].sort((a, b) =>
    String(a.code).localeCompare(String(b.code), undefined, { numeric: true })
  );
  await writeCoa(accounts);
  return {
    accounts,
    added: Math.max(0, accounts.length - existing.length),
    updated: accounts.length,
  };
}

export async function writeCoa(accounts: CoaAccount[]) {
  await ensureAccountingDir();
  await fs.writeFile(
    getCoaFilePath(),
    JSON.stringify(accounts, null, 2),
    "utf8"
  );
}

export async function readRules(): Promise<BankRule[]> {
  await ensureJsonIfMissing(
    getAccountingRulesFilePath(),
    JSON.stringify({ rules: [] }, null, 2)
  );
  const raw = await fs.readFile(getAccountingRulesFilePath(), "utf8");
  const parsed = JSON.parse(raw || '{"rules":[]}');
  const existing: BankRule[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.rules)
      ? parsed.rules
      : [];
  return existing;
}

export async function writeRules(rules: BankRule[]) {
  await ensureAccountingDir();
  await fs.writeFile(
    getAccountingRulesFilePath(),
    JSON.stringify({ rules }, null, 2),
    "utf8"
  );
}

/** Replace live bank rules with repo seed (Xero export mapping). */
export async function syncRulesFromSeed(): Promise<{
  rules: BankRule[];
  count: number;
}> {
  let seedRules: BankRule[] = [];
  try {
    const raw = await fs.readFile(getRepoSeedRulesPath(), "utf8");
    const parsed = JSON.parse(raw || '{"rules":[]}');
    seedRules = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.rules)
        ? parsed.rules
        : [];
  } catch {
    seedRules = [];
  }
  await writeRules(seedRules);
  return { rules: seedRules, count: seedRules.length };
}

export async function readBankAccounts(): Promise<BankAccount[]> {
  await ensureJsonIfMissing(getBankAccountsFilePath(), "[]");
  const raw = await fs.readFile(getBankAccountsFilePath(), "utf8");
  const parsed = JSON.parse(raw || "[]");
  const rows = Array.isArray(parsed) ? parsed : [];
  return rows.map((row, index) => {
    const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    return {
      id: String(r.id || `bank-${index + 1}`),
      name: String(r.name || "Bank account"),
      accountNumber: String(r.accountNumber || ""),
      bsb: String(r.bsb || ""),
      openingBalance: Number(r.openingBalance) || 0,
      openingAsAt: String(r.openingAsAt || "2025-07-01"),
      type: String(r.type || "Cheque"),
    };
  });
}

export async function writeBankAccounts(accounts: BankAccount[]) {
  await ensureAccountingDir();
  await fs.writeFile(
    getBankAccountsFilePath(),
    JSON.stringify(accounts, null, 2),
    "utf8"
  );
}
