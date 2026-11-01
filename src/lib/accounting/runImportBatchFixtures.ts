import { bankLineFingerprint, takeNewBatchLines, linesReadyToCommit, type ImportBatchLine } from "@/lib/accounting/importBatch";

type Check = { name: string; ok: boolean; detail: string };

function eq(name: string, actual: unknown, expected: unknown): Check {
  const ok = actual === expected;
  return {
    name,
    ok,
    detail: ok ? String(actual) : `expected ${expected}, got ${actual}`,
  };
}

function line(partial: Partial<ImportBatchLine> & Pick<ImportBatchLine, "id" | "fingerprint">): ImportBatchLine {
  return {
    bankAccountId: "2020",
    bankAccountName: "NAB",
    date: "2026-08-01",
    amount: -20,
    bankDescription: "WOOLWORTHS",
    userNote: "",
    type: "Expense",
    accountCode: "400",
    accountName: "Purchases",
    noGST: false,
    businessPercent: null,
    personalAccountCode: "",
    personalAccountName: "",
    personalAccountType: "",
    autoReconcile: false,
    receiptIds: [],
    addedAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

function run(): Check[] {
  const checks: Check[] = [];
  const fp = bankLineFingerprint({
    bankAccountId: "2020",
    date: "01/08/2026",
    amount: -20,
    description: "  Woolworths  ",
  });
  checks.push(
    eq(
      "fingerprint ignores case and spacing",
      fp,
      bankLineFingerprint({
        bankAccountId: "2020",
        date: "2026-08-01",
        amount: -20,
        description: "woolworths",
      })
    )
  );
  const first = line({ id: "a", fingerprint: fp });
  const merged = takeNewBatchLines([], [first, line({ id: "b", fingerprint: fp })], new Set());
  checks.push(eq("second copy is skipped", merged.added.length, 1));
  checks.push(eq("batch keeps one", merged.kept.length, 1));
  const again = takeNewBatchLines(merged.kept, [line({ id: "c", fingerprint: fp })], new Set([fp]));
  checks.push(eq("posted line is skipped", again.skipped, 1));
  const uncoded = line({
    id: "u",
    fingerprint: "other",
    type: "Uncategorized",
    accountCode: "9999",
  });
  const split = line({
    id: "s",
    fingerprint: "split",
    businessPercent: 70,
    personalAccountCode: "",
  });
  checks.push(eq("uncoded stays out of commit", linesReadyToCommit([uncoded, first]).length, 1));
  checks.push(eq("split without a personal account waits", linesReadyToCommit([split]).length, 0));
  return checks;
}

const checks = run();
let failed = 0;
for (const check of checks) {
  if (!check.ok) failed += 1;
  console.log(`${check.ok ? "OK" : "FAIL"}  ${check.name}: ${check.detail}`);
}
if (failed) process.exit(1);
console.log(`\nAll ${checks.length} passed`);
