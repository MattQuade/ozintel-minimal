import { groupPartialPayments } from "@/lib/accounting/partialPayments";

type Check = { name: string; ok: boolean; detail: string };

function eq(name: string, actual: unknown, expected: unknown): Check {
  const ok = actual === expected;
  return {
    name,
    ok,
    detail: ok ? String(actual) : `expected ${expected}, got ${actual}`,
  };
}

const groups = groupPartialPayments(
  [
    {
      id: "inv",
      number: "12",
      customerName: "Steven",
      matchKeyword: "Steven",
      total: 280,
      amountDue: 280,
      status: "authorised",
    },
  ],
  [
    {
      id: "full",
      date: "2026-08-01",
      amount: 280,
      description: "TRANSFER FROM STEVEN",
      committed: true,
    },
    {
      id: "part",
      date: "2026-08-03",
      amount: 100,
      description: "STEVEN SMITH",
      committed: true,
    },
    {
      id: "other",
      date: "2026-08-04",
      amount: 40,
      description: "WOOLWORTHS",
      committed: true,
    },
  ]
);

const checks: Check[] = [];
checks.push(eq("one keyword group", groups.length, 1));
checks.push(eq("keyword", groups[0]?.keyword, "Steven"));
checks.push(eq("full amount is not a partial", groups[0]?.payments.length, 1));
checks.push(eq("partial amount", groups[0]?.payments[0]?.amount, 100));
checks.push(eq("partial total", groups[0]?.paidTotal, 100));

let failed = 0;
for (const check of checks) {
  if (!check.ok) failed += 1;
  console.log(`${check.ok ? "OK" : "FAIL"}  ${check.name}: ${check.detail}`);
}
if (failed) process.exit(1);
console.log(`\nAll ${checks.length} passed`);
