import type { BankAccount, LedgerEntry } from "@/lib/accounting/store";
import { toIsoDateInput } from "@/lib/accounting/dates";

export type StatementCheck = {
  bankAccountId: string;
  asAt: string;
  statementBalance: number;
};

export type ReconciliationLine = {
  id: string;
  date: string;
  description: string;
  amount: number;
  runningBalance: number;
};

export type AccountReconciliation = {
  bankAccountId: string;
  name: string;
  accountNumber: string;
  type: string;
  openingAsAt: string;
  /** Opening is added only when its date is on or before the statement date. */
  openingIncluded: boolean;
  openingBalance: number;
  moneyIn: number;
  moneyOut: number;
  booksBalance: number;
  lineCount: number;
  linesBeforeOpening: number;
  linesAfterAsAt: number;
  undatedLines: number;
  statementBalance: number | null;
  /** Statement minus books. Null until a statement balance is entered. */
  difference: number | null;
  lines: ReconciliationLine[];
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function belongsToBank(
  entry: Pick<LedgerEntry, "bankAccountId" | "bankAccountName">,
  bank: BankAccount
): boolean {
  const id = String(entry.bankAccountId || "").trim();
  if (id) return id === bank.id;
  const name = String(entry.bankAccountName || "").trim().toLowerCase();
  const bankName = bank.name.trim().toLowerCase();
  return Boolean(name && bankName && name === bankName);
}

/**
 * Books balance at a statement date:
 * opening (when that opening date is on or before the statement)
 * plus journal lines on this account from the opening date through the statement date.
 */
export function buildBankReconciliation(
  banks: BankAccount[],
  entries: LedgerEntry[],
  asAt: string,
  statements: StatementCheck[] = []
): AccountReconciliation[] {
  const day = toIsoDateInput(asAt);
  if (!day) return [];
  const saved = new Map(
    statements
      .filter((row) => toIsoDateInput(row.asAt) === day)
      .map((row) => [row.bankAccountId, round2(row.statementBalance)])
  );

  return banks.map((bank) => {
    const openingDay = toIsoDateInput(bank.openingAsAt);
    const openingIncluded = !openingDay || openingDay <= day;
    const openingBalance = round2(Number(bank.openingBalance) || 0);
    let linesBeforeOpening = 0;
    let linesAfterAsAt = 0;
    let undatedLines = 0;
    const included: Array<{
      id: string;
      date: string;
      description: string;
      amount: number;
      timestamp: string;
    }> = [];

    for (const entry of entries) {
      if (!belongsToBank(entry, bank)) continue;
      const entryDay = toIsoDateInput(entry.date);
      if (!entryDay) {
        undatedLines += 1;
        continue;
      }
      if (entryDay > day) {
        linesAfterAsAt += 1;
        continue;
      }
      if (openingIncluded && openingDay && entryDay < openingDay) {
        linesBeforeOpening += 1;
        continue;
      }
      included.push({
        id: String(entry.id || ""),
        date: entryDay,
        description: String(entry.description || "").trim() || "—",
        amount: round2(Number(entry.amount) || 0),
        timestamp: String(entry.timestamp || ""),
      });
    }

    included.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    let running = openingIncluded ? openingBalance : 0;
    let moneyIn = 0;
    let moneyOut = 0;
    const lines: ReconciliationLine[] = included.map((row) => {
      if (row.amount > 0) moneyIn = round2(moneyIn + row.amount);
      if (row.amount < 0) moneyOut = round2(moneyOut + Math.abs(row.amount));
      running = round2(running + row.amount);
      return {
        id: row.id,
        date: row.date,
        description: row.description,
        amount: row.amount,
        runningBalance: running,
      };
    });

    const statementBalance = saved.has(bank.id) ? saved.get(bank.id)! : null;
    const difference =
      statementBalance == null ? null : round2(statementBalance - running);

    return {
      bankAccountId: bank.id,
      name: bank.name,
      accountNumber: bank.accountNumber,
      type: bank.type,
      openingAsAt: openingDay,
      openingIncluded,
      openingBalance,
      moneyIn,
      moneyOut,
      booksBalance: running,
      lineCount: lines.length,
      linesBeforeOpening,
      linesAfterAsAt,
      undatedLines,
      statementBalance,
      difference,
      lines,
    };
  });
}
