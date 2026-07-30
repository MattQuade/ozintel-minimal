import path from "path";
import { promises as fs } from "fs";
import {
  getAccountingDataDir,
  getAccountingRulesFilePath,
  getBankAccountsFilePath,
  getCoaFilePath,
  getLedgerFilePath,
  getRepoSeedBankAccountsPath,
  getRepoSeedCoaPath,
  getRepoSeedLedgerPath,
  getRepoSeedRulesPath,
} from "@/lib/dataPaths";

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
  reconciled?: boolean;
  [key: string]: unknown;
};

export type BankRule = {
  id: number;
  name: string;
  matchValue: string;
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

async function seedFileIfMissing(
  targetPath: string,
  seedPath: string,
  fallbackContents: string,
  legacyPath?: string
) {
  try {
    await fs.access(targetPath);
    return;
  } catch {
    // missing — migrate or seed below
  }

  await ensureAccountingDir();

  if (legacyPath) {
    try {
      const legacyRaw = await fs.readFile(legacyPath, "utf8");
      const parsed = JSON.parse(legacyRaw || "null");
      const hasData = Array.isArray(parsed)
        ? parsed.length > 0
        : Boolean(parsed && typeof parsed === "object");
      if (hasData) {
        await fs.writeFile(targetPath, legacyRaw, "utf8");
        console.log(`[accounting] Migrated legacy file to ${targetPath}`);
        return;
      }
    } catch {
      // no usable legacy file
    }
  }

  try {
    const seedRaw = await fs.readFile(seedPath, "utf8");
    await fs.writeFile(targetPath, seedRaw, "utf8");
    console.log(`[accounting] Seeded ${targetPath} from repo`);
  } catch {
    await fs.writeFile(targetPath, fallbackContents, "utf8");
    console.log(`[accounting] Created empty ${targetPath}`);
  }
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

export async function readLedger(): Promise<LedgerEntry[]> {
  await seedFileIfMissing(
    getLedgerFilePath(),
    getRepoSeedLedgerPath(),
    "[]",
    path.join(process.cwd(), "data", "ledger.json")
  );
  const raw = await fs.readFile(getLedgerFilePath(), "utf8");
  const parsed = JSON.parse(raw || "[]");
  const rows = Array.isArray(parsed) ? parsed : [];
  return rows.map((row, index) =>
    ensureEntryId(row && typeof row === "object" ? (row as Record<string, unknown>) : {}, index)
  );
}

export async function writeLedger(entries: LedgerEntry[]) {
  await ensureAccountingDir();
  await fs.writeFile(
    getLedgerFilePath(),
    JSON.stringify(entries, null, 2),
    "utf8"
  );
}

export async function appendLedgerEntries(
  incoming: Array<Partial<LedgerEntry>>
): Promise<{ saved: number; total: number; entries: LedgerEntry[] }> {
  const ledger = await readLedger();
  const stamped = incoming.map((e, index) =>
    ensureEntryId(
      {
        ...e,
        timestamp: e.timestamp || new Date().toISOString(),
        id: e.id || `LE${Date.now()}-${index}`,
      },
      ledger.length + index
    )
  );
  const next = [...ledger, ...stamped];
  await writeLedger(next);
  return { saved: stamped.length, total: next.length, entries: next };
}

export async function updateLedgerEntry(
  patch: Partial<LedgerEntry> & { id: string }
): Promise<LedgerEntry> {
  const ledger = await readLedger();
  const idx = ledger.findIndex((e) => e.id === patch.id);
  if (idx < 0) throw new Error("Entry not found");
  const updated: LedgerEntry = {
    ...ledger[idx],
    ...patch,
    id: ledger[idx].id,
  };
  ledger[idx] = updated;
  await writeLedger(ledger);
  return updated;
}

export async function deleteLedgerEntry(id: string): Promise<boolean> {
  const ledger = await readLedger();
  const next = ledger.filter((e) => e.id !== id);
  if (next.length === ledger.length) return false;
  await writeLedger(next);
  return true;
}

export async function resetLedger() {
  await writeLedger([]);
}

export async function readCoa(): Promise<CoaAccount[]> {
  await seedFileIfMissing(
    getCoaFilePath(),
    getRepoSeedCoaPath(),
    "[]",
    path.join(process.cwd(), "data", "coa.json")
  );
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
  await seedFileIfMissing(
    getAccountingRulesFilePath(),
    getRepoSeedRulesPath(),
    JSON.stringify({ rules: [] }, null, 2)
  );
  const raw = await fs.readFile(getAccountingRulesFilePath(), "utf8");
  const parsed = JSON.parse(raw || '{"rules":[]}');
  if (Array.isArray(parsed)) return parsed as BankRule[];
  return Array.isArray(parsed.rules) ? parsed.rules : [];
}

export async function writeRules(rules: BankRule[]) {
  await ensureAccountingDir();
  await fs.writeFile(
    getAccountingRulesFilePath(),
    JSON.stringify({ rules }, null, 2),
    "utf8"
  );
}

const DEFAULT_BANKS: BankAccount[] = [
  {
    id: "1",
    name: "NAB Credit Card",
    accountNumber: "NAB-CC-XXXX",
    bsb: "",
    openingBalance: 0,
    openingAsAt: "2025-07-01",
    type: "Credit Card",
  },
  {
    id: "2",
    name: "NAB Business Account",
    accountNumber: "NAB-BIZ-XXXX",
    bsb: "084-XXX",
    openingBalance: 0,
    openingAsAt: "2025-07-01",
    type: "Cheque",
  },
  {
    id: "3",
    name: "ANZ Business Account",
    accountNumber: "ANZ-BIZ-XXXX",
    bsb: "013-XXX",
    openingBalance: 0,
    openingAsAt: "2025-07-01",
    type: "Cheque",
  },
];

export async function readBankAccounts(): Promise<BankAccount[]> {
  await seedFileIfMissing(
    getBankAccountsFilePath(),
    getRepoSeedBankAccountsPath(),
    JSON.stringify(DEFAULT_BANKS, null, 2)
  );
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
