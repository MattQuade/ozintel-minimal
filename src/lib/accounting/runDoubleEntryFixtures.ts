/**
 * Balanced bank journals from 1 July 2026.
 * Run: npx tsx src/lib/accounting/runDoubleEntryFixtures.ts
 */

import {
  applyDoubleEntry,
  expandBankLine,
  journalSumsToZero,
  retargetAllocatedDeposits,
} from "@/lib/accounting/doubleEntry";
import type { BankAccount } from "@/lib/accounting/store";

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

const banks = [
  bank({ id: "2020", name: "NAB Business Account #4091", accountNumber: "4091" }),
  bank({ id: "3", name: "ANZ Business Account", accountNumber: "ANZ" }),
];

function run(): Check[] {
  const checks: Check[] = [];
  const spend = expandBankLine(
    {
      id: "s1",
      date: "2026-08-28",
      description: "DEANOS MOBILE MECHANIC",
      amount: -285,
      type: "Expense",
      accountCode: "4000",
      accountName: "Repairs",
      bankAccountId: "2020",
      source: "bank-import",
      hasGST: true,
      gstAmount: 25.91,
    },
    banks
  );
  checks.push(eq("spend balances", spend ? journalSumsToZero(spend) : false, true));
  checks.push(eq("spend bank", spend?.find((line) => line.journalRole === "bank")?.amount, -285));
  checks.push(
    eq("spend bank account", spend?.find((line) => line.journalRole === "bank")?.accountCode, "2020")
  );
  checks.push(eq("spend gst", spend?.find((line) => line.journalRole === "gst")?.amount, 25.91));
  checks.push(
    eq("spend expense net", spend?.find((line) => line.journalRole === "account")?.amount, 259.09)
  );
  checks.push(
    eq(
      "spend still shows the bank gross",
      spend?.find((line) => line.journalRole === "account")?.displayAmount,
      -285
    )
  );

  const deposit = expandBankLine(
    {
      id: "d1",
      date: "2026-08-01",
      description: "WHITE TANK HOTEL",
      amount: 110,
      type: "Revenue",
      accountCode: "0500",
      accountName: "Draught Wholesale",
      bankAccountId: "3",
      bankAccountName: "ANZ Business Account",
      source: "bank-import",
      hasGST: true,
      gstAmount: 10,
    },
    banks
  );
  checks.push(eq("deposit balances", deposit ? journalSumsToZero(deposit) : false, true));
  checks.push(
    eq("anz chart code", deposit?.find((line) => line.journalRole === "bank")?.accountCode, "2030")
  );
  checks.push(eq("deposit gst credit", deposit?.find((line) => line.journalRole === "gst")?.amount, -10));
  checks.push(
    eq("deposit income credit", deposit?.find((line) => line.journalRole === "account")?.amount, -100)
  );

  const instalment = expandBankLine(
    {
      id: "p1",
      date: "2026-08-10",
      description: "GRONG GRONG HOTEL",
      amount: 2000,
      type: "Revenue",
      accountCode: "0500",
      accountName: "Draught Wholesale",
      bankAccountId: "2020",
      source: "bank-import",
      hasGST: true,
    },
    banks,
    2000
  );
  checks.push(eq("instalment balances", instalment ? journalSumsToZero(instalment) : false, true));
  checks.push(
    eq("instalment credits receivables", instalment?.find((line) => line.journalRole === "ar")?.accountCode, "2101")
  );
  checks.push(
    eq("instalment has no gst line", instalment?.some((line) => line.journalRole === "gst") || false, false)
  );
  checks.push(
    eq("instalment ar amount", instalment?.find((line) => line.journalRole === "ar")?.amount, -2000)
  );

  const converted = applyDoubleEntry(
    [
      {
        id: "old",
        date: "2026-06-15",
        description: "LAST YEAR",
        amount: -50,
        type: "Expense",
        accountCode: "4000",
        bankAccountId: "2020",
        source: "bank-import",
        hasGST: true,
        gstAmount: 4.55,
      },
      {
        id: "q1",
        date: "2026-07-02",
        description: "OFFICEWORKS",
        amount: -110,
        type: "Expense",
        accountCode: "4000",
        accountName: "Office",
        bankAccountId: "2020",
        source: "bank-import",
        noGST: true,
      },
    ],
    { banks }
  );
  checks.push(eq("converted one q1 line", converted.converted, 1));
  checks.push(eq("last year stays one line", converted.entries.filter((line) => line.id === "old").length, 1));
  checks.push(
    eq(
      "no-gst expense is the full debit",
      converted.entries.find((line) => line.id === "q1")?.amount,
      110
    )
  );

  const again = applyDoubleEntry(converted.entries, { banks });
  checks.push(eq("second pass converts nothing", again.converted, 0));

  const moved = retargetAllocatedDeposits(
    [
      {
        id: "pay",
        journalRole: "account",
        journalRef: "DE-pay",
        displayAmount: 2400,
        amount: -2181.82,
        accountCode: "0500",
        type: "Revenue",
        gstAmount: 218.18,
      },
      {
        id: "pay-gst",
        journalRole: "gst",
        journalRef: "DE-pay",
        amount: -218.18,
        accountCode: "820",
      },
      {
        id: "pay-bank",
        journalRole: "bank",
        journalRef: "DE-pay",
        amount: 2400,
        accountCode: "2020",
      },
    ],
    { pay: 2400 }
  );
  checks.push(eq("retarget drops gst", moved.entries.some((line) => line.journalRole === "gst"), false));
  checks.push(eq("retarget is receivable", moved.entries.find((line) => line.id === "pay")?.accountCode, "2101"));
  checks.push(eq("retarget still balances", journalSumsToZero(moved.entries), true));

  return checks;
}

const results = run();
const failed = results.filter((c) => !c.ok);
for (const c of results) {
  console.log(`${c.ok ? "ok" : "FAIL"}  ${c.name}  ${c.detail}`);
}
if (failed.length) {
  console.error(`\n${failed.length} double-entry fixture(s) failed`);
  process.exit(1);
}
console.log(`\n${results.length} double-entry fixtures passed`);
