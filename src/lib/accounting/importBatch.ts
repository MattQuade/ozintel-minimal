import { promises as fs } from "fs";
import path from "path";
import { getImportBatchFilePath } from "@/lib/dataPaths";
import { toIsoDateInput } from "@/lib/accounting/dates";
import { round2 } from "@/lib/accounting/invoiceMath";
import { parseBusinessPercent } from "@/lib/accounting/percentSplit";
import {
  classifyBatch,
  type BankRule,
} from "@/core/rules/rulesEngine";
import {
  matchDepositsToInvoices,
  isDepositAmount,
  type InvoiceMatchCandidate,
} from "@/lib/accounting/invoiceDepositMatch";
import {
  readLedger,
  readRules,
  type LedgerEntry,
} from "@/lib/accounting/store";

export type ImportBatchLine = {
  id: string;
  fingerprint: string;
  bankAccountId: string;
  bankAccountName: string;
  date: string;
  amount: number;
  bankDescription: string;
  userNote: string;
  type: string;
  accountCode: string;
  accountName: string;
  noGST: boolean;
  businessPercent: number | null;
  personalAccountCode: string;
  personalAccountName: string;
  personalAccountType: string;
  autoReconcile: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceAutoMatched?: boolean;
  receiptIds: string[];
  quarter?: string;
  addedAt: string;
};

export function bankLineFingerprint(parts: {
  bankAccountId: string;
  date: string;
  amount: number;
  description: string;
}): string {
  const desc = String(parts.description || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const date = toIsoDateInput(parts.date) || String(parts.date || "").trim();
  const amount = round2(Number(parts.amount) || 0).toFixed(2);
  return `${parts.bankAccountId}|${date}|${amount}|${desc}`;
}

export function ledgerFingerprints(
  entries: Array<{
    importFingerprint?: unknown;
    journalRole?: unknown;
    source?: unknown;
    date?: unknown;
    amount?: unknown;
    displayAmount?: unknown;
    description?: unknown;
    bankAccountId?: unknown;
  }>
): Set<string> {
  const out = new Set<string>();
  for (const entry of entries) {
    const stored = String(entry.importFingerprint || "").trim();
    if (stored) out.add(stored);
    const role = String(entry.journalRole || "");
    const source = String(entry.source || "");
    const bankFace = role === "bank" || (source === "bank-import" && !role);
    if (!bankFace) continue;
    const bankAccountId = String(entry.bankAccountId || "").trim();
    const date = toIsoDateInput(String(entry.date || ""));
    if (!bankAccountId || !date) continue;
    const amount =
      role === "bank"
        ? Number(entry.amount) || 0
        : Number(entry.displayAmount ?? entry.amount) || 0;
    out.add(
      bankLineFingerprint({
        bankAccountId,
        date,
        amount,
        description: String(entry.description || ""),
      })
    );
  }
  return out;
}

export function takeNewBatchLines(
  existing: ImportBatchLine[],
  incoming: ImportBatchLine[],
  alreadyPosted: Set<string>
): { kept: ImportBatchLine[]; added: ImportBatchLine[]; skipped: number } {
  const seen = new Set<string>([
    ...existing.map((line) => line.fingerprint),
    ...alreadyPosted,
  ]);
  const added: ImportBatchLine[] = [];
  let skipped = 0;
  for (const line of incoming) {
    if (!line.fingerprint || seen.has(line.fingerprint)) {
      skipped += 1;
      continue;
    }
    seen.add(line.fingerprint);
    added.push(line);
  }
  return { kept: [...existing, ...added], added, skipped };
}

function readyAccount(line: ImportBatchLine): boolean {
  const code = String(line.accountCode || "").trim();
  if (!code || code === "9999") return false;
  if (line.type === "Uncategorized") return false;
  if (line.businessPercent && !String(line.personalAccountCode || "").trim()) {
    return false;
  }
  return true;
}

export function linesReadyToCommit(lines: ImportBatchLine[]): ImportBatchLine[] {
  return lines.filter(readyAccount);
}

async function readBatchFile(): Promise<ImportBatchLine[]> {
  try {
    const raw = await fs.readFile(getImportBatchFilePath(), "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as ImportBatchLine[]) : [];
  } catch {
    return [];
  }
}

async function writeBatchFile(lines: ImportBatchLine[]) {
  const target = getImportBatchFilePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(lines, null, 2), "utf8");
}

export async function readImportBatch(): Promise<ImportBatchLine[]> {
  return readBatchFile();
}

export async function writeImportBatch(lines: ImportBatchLine[]) {
  await writeBatchFile(lines);
}

export function buildBatchLines(opts: {
  rows: unknown[][];
  rules: BankRule[];
  bankAccountId: string;
  bankAccountName: string;
  invoices: InvoiceMatchCandidate[];
  quarter?: string;
  now?: string;
}): ImportBatchLine[] {
  const classified = classifyBatch(opts.rows, opts.rules, opts.bankAccountId);
  const deposits = classified.flatMap((row, index) => {
    const original = Array.isArray(row.original) ? row.original : [];
    const amount = parseFloat(String(original[1] ?? 0));
    if (!isDepositAmount(amount)) return [];
    return [
      {
        key: String(index),
        amount,
        description: String(original[2] || ""),
        date: toIsoDateInput(String(original[0] ?? "")) || String(original[0] ?? ""),
      },
    ];
  });
  const matched = matchDepositsToInvoices(opts.invoices, deposits);
  const now = opts.now || new Date().toISOString();
  return classified.map((row, index) => {
    const original = Array.isArray(row.original) ? row.original : [];
    const date = toIsoDateInput(String(original[0] ?? "")) || String(original[0] ?? "");
    const amount = round2(parseFloat(String(original[1] ?? 0)) || 0);
    const bankDescription = String(original[2] || "").trim();
    const rule = row.rule && typeof row.rule === "object" ? row.rule : undefined;
    const invoice = matched.get(String(index));
    const percent = parseBusinessPercent(rule?.businessPercent);
    const personalCode = percent
      ? String(rule?.personalAccountCode || "").trim()
      : "";
    return {
      id: `batch-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      fingerprint: bankLineFingerprint({
        bankAccountId: opts.bankAccountId,
        date,
        amount,
        description: bankDescription,
      }),
      bankAccountId: opts.bankAccountId,
      bankAccountName: opts.bankAccountName,
      date,
      amount,
      bankDescription,
      userNote: "",
      type: invoice ? String(row.type || "Revenue") : String(row.type || "Uncategorized"),
      accountCode: String(row.accountCode || ""),
      accountName: String(row.accountName || ""),
      noGST: Boolean(row.noGST),
      businessPercent: personalCode ? percent : null,
      personalAccountCode: personalCode,
      personalAccountName: personalCode
        ? String(rule?.personalAccountName || "")
        : "",
      personalAccountType: personalCode
        ? String(rule?.personalAccountType || "Equity")
        : "",
      autoReconcile: Boolean(rule && rule.autoReconcile !== false),
      invoiceId: invoice?.id,
      invoiceNumber: invoice?.number,
      invoiceAutoMatched: Boolean(invoice),
      receiptIds: [],
      quarter: opts.quarter || "",
      addedAt: now,
    };
  });
}

export async function addRowsToImportBatch(opts: {
  rows: unknown[][];
  bankAccountId: string;
  bankAccountName: string;
  invoices: InvoiceMatchCandidate[];
  quarter?: string;
}): Promise<{ lines: ImportBatchLine[]; added: number; skipped: number }> {
  const rules = (await readRules()) as BankRule[];
  const incoming = buildBatchLines({
    rows: opts.rows,
    rules,
    bankAccountId: opts.bankAccountId,
    bankAccountName: opts.bankAccountName,
    invoices: opts.invoices,
    quarter: opts.quarter,
  });
  const [existing, ledger] = await Promise.all([readBatchFile(), readLedger()]);
  const merged = takeNewBatchLines(
    existing,
    incoming,
    ledgerFingerprints(ledger)
  );
  await writeBatchFile(merged.kept);
  return {
    lines: merged.kept,
    added: merged.added.length,
    skipped: merged.skipped,
  };
}

export async function updateImportBatchLine(
  id: string,
  patch: Partial<
    Pick<
      ImportBatchLine,
      | "userNote"
      | "type"
      | "accountCode"
      | "accountName"
      | "noGST"
      | "businessPercent"
      | "personalAccountCode"
      | "personalAccountName"
      | "personalAccountType"
      | "invoiceId"
      | "invoiceNumber"
      | "invoiceAutoMatched"
      | "receiptIds"
      | "autoReconcile"
    >
  >
): Promise<ImportBatchLine | null> {
  const lines = await readBatchFile();
  const idx = lines.findIndex((line) => line.id === id);
  if (idx < 0) return null;
  const current = lines[idx];
  const next: ImportBatchLine = {
    ...current,
    ...patch,
    userNote:
      patch.userNote !== undefined ? String(patch.userNote || "") : current.userNote,
    businessPercent:
      patch.businessPercent !== undefined
        ? parseBusinessPercent(patch.businessPercent)
        : current.businessPercent,
    id: current.id,
    fingerprint: current.fingerprint,
    bankDescription: current.bankDescription,
    amount: current.amount,
    date: current.date,
    bankAccountId: current.bankAccountId,
  };
  if (!next.businessPercent) {
    next.personalAccountCode = "";
    next.personalAccountName = "";
    next.personalAccountType = "";
  }
  lines[idx] = next;
  await writeBatchFile(lines);
  return next;
}

export function batchLineToLedgerEntry(line: ImportBatchLine): Partial<LedgerEntry> {
  return {
    date: line.date,
    amount: line.amount,
    description: line.bankDescription,
    userNote: line.userNote,
    type: line.type,
    accountCode: line.accountCode,
    accountName: line.accountName,
    noGST: line.noGST,
    hasGST: !line.noGST,
    businessPercent: line.businessPercent ?? undefined,
    personalAccountCode: line.personalAccountCode || undefined,
    personalAccountName: line.personalAccountName || undefined,
    personalAccountType: line.personalAccountType || undefined,
    importFingerprint: line.fingerprint,
    reconciled: line.autoReconcile,
    bankAccountId: line.bankAccountId,
    bankAccountName: line.bankAccountName,
    source: "bank-import",
    quarter: line.quarter || undefined,
    timestamp: new Date().toISOString(),
    ...(line.receiptIds.length > 0 ? { receiptIds: line.receiptIds } : {}),
  };
}

export async function removeImportBatchLines(ids: string[]) {
  const drop = new Set(ids);
  const lines = await readBatchFile();
  await writeBatchFile(lines.filter((line) => !drop.has(line.id)));
}

export type { LedgerEntry };
