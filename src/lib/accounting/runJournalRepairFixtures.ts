/**
 * Phrase matching and journal repair for the September 2026 miscodes.
 * Run: npx tsx src/lib/accounting/runJournalRepairFixtures.ts
 */
import { containsAsPhrase, classifyTransaction, type BankRule } from "../../core/rules/rulesEngine";
import { accountFixForDescription, repairJournalEntries } from "./journalRepair";
import { withJournalRuleFixes } from "./journalRuleFixes";

function eq(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

eq("mobil not mobile", containsAsPhrase("anz mobile banking payment", "mobil"), false);
eq("ato not caton", containsAsPhrase("dr tim caton wagga wagga", "ato"), false);
eq("bas not base44", containsAsPhrase("base44 www.base44.com", "bas"), false);
eq("cc repayment", containsAsPhrase("internet payment cc rpymnt", "cc rpymnt"), true);
eq("white tank", containsAsPhrase("payment white tank hotel", "white tank"), true);

const fuel: BankRule = {
  id: 1,
  name: "Mobil Fuel",
  matchValue: "MOBIL",
  matchField: "description",
  matchType: "contains",
  accountCode: "1348",
  accountName: "Fuel & Oil",
  type: "Expense",
  direction: "spend",
};
const classified = classifyTransaction(
  ["2026-09-24", "-1237.16", "ANZ MOBILE BANKING PAYMENT 705353 TO GR JM Willis"],
  [fuel]
);
eq("willis not fuel", classified.accountCode, "9999");

const fixed = withJournalRuleFixes([fuel]);
const again = classifyTransaction(
  ["2026-09-21", "-50", "BASE44 WWW.BASE44.COM"],
  fixed.rules
);
eq("base44 software", again.accountCode, "1577");

const matt = classifyTransaction(
  ["2026-09-24", "-500", "ANZ MOBILE BANKING PAYMENT 171788 TO Matt Aurelie Quade"],
  fixed.rules
);
eq("matt transfer", matt.accountCode, "2480");

eq(
  "caton loan",
  accountFixForDescription("Dr Tim Caton Wagga Wagga", "822")?.accountCode,
  "3565/04"
);
eq(
  "hammond income",
  accountFixForDescription("Hammond Cristofarocorey", "1348")?.accountCode,
  "0500"
);
eq(
  "card transfer",
  accountFixForDescription("INTERNET PAYMENT CC RPYMNT", "2475")?.accountName,
  "Bank Transfer"
);

const repaired = repairJournalEntries([
  {
    id: "bank",
    date: "2026-09-28",
    description: "White Tank Hotel",
    amount: 2000,
    type: "Revenue",
    accountCode: "0500",
    accountName: "Other Income",
    source: "bank-import",
    noGST: false,
  },
  {
    id: "ar",
    date: "2026-09-28",
    description: "Invoice 12 — White Tank Hotel",
    amount: 2000,
    accountCode: "2101",
    source: "invoice",
    journalRef: "INV-AUTH-12",
  },
  {
    id: "rev",
    date: "2026-09-28",
    description: "Invoice 12 — White Tank Hotel",
    amount: -1818.18,
    accountCode: "0500",
    source: "invoice",
    journalRef: "INV-AUTH-12",
  },
  {
    id: "gst",
    date: "2026-09-28",
    description: "Invoice 12 — White Tank Hotel",
    amount: -181.82,
    accountCode: "820",
    source: "invoice",
    journalRef: "INV-AUTH-12",
  },
]);
eq(
  "hammond stays other income",
  accountFixForDescription("Hammond Cristofarocorey", "1348")?.accountName,
  "Other Income"
);
eq(
  "katarina is draught wholesale",
  accountFixForDescription("TRANSFER FROM KATARINA NAMANA TALLIMBA REPAYMENT", "0500")
    ?.accountName,
  "Draught Wholesale"
);

const hotels = withJournalRuleFixes([]);
function coded(description: string, amount: string) {
  return classifyTransaction(["2026-09-12", amount, description], hotels.rules);
}
eq("mangoplah draught", coded("PAYMENT FROM MANGOPLAH HOTEL", "800").accountName, "Draught Wholesale");
eq("tallimba draught", coded("TALLIMBA HOTEL", "640").accountName, "Draught Wholesale");
eq(
  "katarina tallimba inn",
  coded("TRANSFER FROM KATARINA NAMANA TALLIMBA REPAYMENT", "111.11").accountName,
  "Draught Wholesale"
);
eq("grong draught", coded("ROYAL HOTEL GRONG GRONG", "791.19").accountName, "Draught Wholesale");
eq("lockhart draught", coded("RAILWAY HOTEL LOCKHART", "900").accountName, "Draught Wholesale");
eq("white tank draught", coded("WHITE TANK HOTEL", "2000").accountName, "Draught Wholesale");
eq("lockhart cafe not draught", coded("SQ *THE LOCKHART CAFE RESLockhart", "-42.63").accountCode, "9999");
eq("tallimba p and c not draught", coded("TALLIMBA P AND C TALLIMBA", "-40").accountCode, "9999");

const katarinaRule = withJournalRuleFixes([
  {
    id: 3215,
    name: "Katarina Namana Other Income",
    matchValue: "KATARINA NAMANA",
    matchValues: ["KATARINA"],
    accountCode: "0500",
    accountName: "Other Income",
    type: "Revenue",
  },
  {
    id: 3257,
    name: "Tallimba P and C",
    matchValue: "TALLIMBA P AND C",
    matchValues: ["TALLIMBA"],
    accountCode: "3565/04",
    accountName: "Loan - Matt Quade",
    type: "Liability",
    direction: "spend",
    noGST: true,
  },
]);
eq(
  "katarina rule renamed",
  katarinaRule.rules.find((rule) => rule.id === 3215)?.accountName,
  "Draught Wholesale"
);
eq(
  "tallimba p and c rule kept",
  katarinaRule.rules.find((rule) => rule.id === 3257)?.accountCode,
  "3565/04"
);

eq("invoice journal kept beside the bank line", repaired.entries.length, 4);
eq("kept bank line", repaired.entries[0]?.id, "bank");

const split = repairJournalEntries([
  {
    id: "gross",
    date: "2026-09-28",
    description: "White Tank Hotel",
    amount: 2200,
    accountCode: "2101",
    accountName: "Accounts Receivable",
    type: "Asset",
    source: "bank-import",
  },
  {
    id: "net",
    date: "2026-09-28",
    description: "White Tank Hotel",
    amount: 2000,
    accountCode: "0500",
    accountName: "Other Income",
    type: "Revenue",
    source: "bank-import",
  },
  {
    id: "gst",
    date: "2026-09-28",
    description: "White Tank Hotel",
    amount: 200,
    accountCode: "820",
    accountName: "GST",
    type: "Liability",
    source: "bank-import",
  },
]);
eq("split collapsed", split.entries.length, 1);
eq("split kept gross", split.entries[0]?.id, "gross");
eq("split is 0500", split.entries[0]?.accountCode, "0500");
eq("split is draught wholesale", split.entries[0]?.accountName, "Draught Wholesale");
eq("bank line renamed", repaired.entries[0]?.accountName, "Draught Wholesale");

console.log("journal repair fixtures ok");
