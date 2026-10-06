/**
 * Bank reconciliation: opening + journal lines through the statement date.
 * Run: npx tsx src/lib/accounting/runBankReconciliationFixtures.ts
 */

import { buildBankReconciliation } from "@/lib/accounting/bankReconciliation";
import type { BankAccount, LedgerEntry } from "@/lib/accounting/store";

type Check = { name: string; ok: boolean; detail: string };

function eq(name: string, actual: unknown, expected: unknown): Check {
  const ok = actual === expected;
  return {
    name,
    ok,
    detail: ok ? String(actual) : `expected ${expected}, got ${actual}`,
  };
}

function bank(partial: Partial<BankAccount> & Pick<BankAccount, "id" | "name">): BankAccount {
  return {
    accountNumber: "",
    bsb: "",
    openingBalance: 0,
    openingAsAt: "2026-06-30",
    type: "Cheque",
    ...partial,
  };
}

function line(
  partial: Partial<LedgerEntry> & Pick<LedgerEntry, "id" | "date" | "amount">
): LedgerEntry {
  return {
    description: "",
    type: "Expense",
    ...partial,
  };
}

function run(): Check[] {
  const banks = [
    bank({ id: "nab", name: "NAB Business", openingBalance: 1000, accountNumber: "4091" }),
    bank({ id: "anz", name: "ANZ", openingBalance: 50, accountNumber: "2202" }),
    bank({
      id: "card",
      name: "NAB Card",
      openingBalance: 200,
      openingAsAt: "2026-06-30",
      type: "Credit Card",
      accountNumber: "2020",
    }),
  ];
  const entries: LedgerEntry[] = [
    line({
      id: "before",
      date: "2026-06-29",
      amount: 999,
      bankAccountId: "nab",
      description: "before opening",
    }),
    line({
      id: "in",
      date: "2026-07-02",
      amount: 100,
      bankAccountId: "nab",
      description: "deposit",
    }),
    line({
      id: "out",
      date: "2026-08-28",
      amount: -40,
      bankAccountId: "nab",
      description: "payment",
    }),
    line({
      id: "october",
      date: "2026-10-02",
      amount: -5,
      bankAccountId: "nab",
      description: "after Q1",
    }),
    line({
      id: "by-name",
      date: "2026-07-15",
      amount: 20,
      bankAccountName: "ANZ",
      description: "named only",
    }),
    line({
      id: "other-id",
      date: "2026-07-15",
      amount: 7,
      bankAccountId: "other",
      bankAccountName: "NAB Business",
      description: "belongs to the other account",
    }),
    line({
      id: "card-spend",
      date: "2026-08-01",
      amount: -15,
      bankAccountId: "card",
      description: "card purchase",
    }),
  ];

  const report = buildBankReconciliation(banks, entries, "2026-09-30", [
    { bankAccountId: "nab", asAt: "30/09/2026", statementBalance: 1100 },
  ]);
  const nab = report.find((row) => row.bankAccountId === "nab");
  const anz = report.find((row) => row.bankAccountId === "anz");
  const card = report.find((row) => row.bankAccountId === "card");

  const checks: Check[] = [];
  checks.push(eq("three accounts", report.length, 3));
  checks.push(eq("nab books", nab?.booksBalance, 1060));
  checks.push(eq("nab money in", nab?.moneyIn, 100));
  checks.push(eq("nab money out", nab?.moneyOut, 40));
  checks.push(eq("nab line count", nab?.lineCount, 2));
  checks.push(eq("nab skips pre-opening", nab?.linesBeforeOpening, 1));
  checks.push(eq("nab skips after statement", nab?.linesAfterAsAt, 1));
  checks.push(eq("nab statement higher by 40", nab?.difference, 40));
  checks.push(eq("running balance ends at books", nab?.lines.at(-1)?.runningBalance, 1060));
  checks.push(eq("anz matches by name", anz?.booksBalance, 70));
  checks.push(eq("anz has no statement yet", anz?.difference, null));
  checks.push(eq("other account id stays off NAB", nab?.lineCount, 2));
  checks.push(eq("card books", card?.booksBalance, 185));

  const matched = buildBankReconciliation(banks, entries, "2026-09-30", [
    { bankAccountId: "nab", asAt: "2026-09-30", statementBalance: 1060 },
  ]);
  checks.push(
    eq(
      "matching statement difference is zero",
      matched.find((row) => row.bankAccountId === "nab")?.difference,
      0
    )
  );

  const laterOpening = buildBankReconciliation(
    [bank({ id: "nab", name: "NAB Business", openingBalance: 500, openingAsAt: "2026-10-15" })],
    entries,
    "2026-09-30"
  );
  checks.push(eq("opening after statement is left out", laterOpening[0]?.openingIncluded, false));
  checks.push(eq("lines still sum without that opening", laterOpening[0]?.booksBalance, 1059));

  return checks;
}

const results = run();
const failed = results.filter((c) => !c.ok);
for (const c of results) {
  console.log(`${c.ok ? "ok" : "FAIL"}  ${c.name}  ${c.detail}`);
}
if (failed.length) {
  console.error(`\n${failed.length} bank reconciliation fixture(s) failed`);
  process.exit(1);
}
console.log(`\n${results.length} bank reconciliation fixtures passed`);
