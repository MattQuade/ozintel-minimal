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
  await seedFileIfMissing(
    getLedgerFilePath(),
    getRepoSeedLedgerPath(),
    "[]",
    path.join(process.cwd(), "data", "ledger.json")
  );
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

export async function appendLedgerEntries(
  incoming: Array<Partial<LedgerEntry>>
): Promise<{ saved: number; total: number; entries: LedgerEntry[] }> {
  return withLedgerLock(async () => {
    const ledger = await readLedgerUnlocked();
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
    await writeLedgerUnlocked(next);
    return { saved: stamped.length, total: next.length, entries: next };
  });
}

export async function updateLedgerEntry(
  patch: Partial<LedgerEntry> & { id: string }
): Promise<LedgerEntry> {
  return withLedgerLock(async () => {
    const ledger = await readLedgerUnlocked();
    const idx = ledger.findIndex((e) => e.id === patch.id);
    if (idx < 0) throw new Error("Entry not found");
    const updated: LedgerEntry = {
      ...ledger[idx],
      ...patch,
      id: ledger[idx].id,
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
    const next = ledger.filter((e) => !idSet.has(e.id));
    const deleted = ledger.length - next.length;
    if (deleted > 0) await writeLedgerUnlocked(next);
    return deleted;
  });
}

export async function resetLedger() {
  return withLedgerLock(() => writeLedgerUnlocked([]));
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
  const existing: BankRule[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.rules)
      ? parsed.rules
      : [];

  // Merge any missing seed rules by id (keeps Restore defaults from being required
  // every time we ship new bank rules).
  let seedRules: BankRule[] = [];
  try {
    const seedRaw = await fs.readFile(getRepoSeedRulesPath(), "utf8");
    const seedParsed = JSON.parse(seedRaw || '{"rules":[]}');
    seedRules = Array.isArray(seedParsed)
      ? seedParsed
      : Array.isArray(seedParsed.rules)
        ? seedParsed.rules
        : [];
  } catch {
    seedRules = [];
  }

  const byId = new Map<number, BankRule>();
  for (const r of existing) {
    if (r && typeof r.id === "number") byId.set(r.id, r);
  }
  let added = 0;
  let updated = 0;
  for (const s of seedRules) {
    if (!s || typeof s.id !== "number") continue;
    const prev = byId.get(s.id);
    if (!prev) {
      byId.set(s.id, s);
      added += 1;
      continue;
    }
    // Prefer seed when match/account fields changed for the same id
    const changed =
      prev.matchValue !== s.matchValue ||
      prev.accountCode !== s.accountCode ||
      prev.direction !== s.direction ||
      prev.bankAccountId !== s.bankAccountId ||
      JSON.stringify(prev.matchValues || []) !==
        JSON.stringify(s.matchValues || []);
    if (changed) {
      byId.set(s.id, { ...prev, ...s });
      updated += 1;
    }
  }

  // Keep any custom live-only rules (ids not in seed)
  const seedIds = new Set(seedRules.map((r) => r.id));
  for (const r of existing) {
    if (r && typeof r.id === "number" && !seedIds.has(r.id)) {
      byId.set(r.id, r);
    }
  }

  const merged = [...byId.values()].sort((a, b) => a.id - b.id);
  if (added > 0 || updated > 0) {
    await writeRules(merged);
    console.log(
      `[accounting] Merged bank rules from seed (+${added} new, ~${updated} updated)`
    );
  }
  return merged;
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

const DEFAULT_BANKS: BankAccount[] = [
  {
    id: "2010",
    name: "NAB Credit Card #9497 / 3436",
    accountNumber: "9497/3436",
    bsb: "",
    openingBalance: 0,
    openingAsAt: "2025-07-01",
    type: "Credit Card",
  },
  {
    id: "2020",
    name: "NAB Business Account #4091",
    accountNumber: "4091",
    bsb: "",
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
