/**
 * Fixtures for keyword + amount invoice auto-match.
 * Run: npm run test:invoice-match
 */

import {
  findUniqueDepositInvoiceMatch,
  matchDepositsToInvoices,
  type InvoiceMatchCandidate,
} from "@/lib/accounting/invoiceDepositMatch";

type Check = { name: string; ok: boolean; detail: string };

function eq(name: string, actual: unknown, expected: unknown): Check {
  const ok = actual === expected;
  return {
    name,
    ok,
    detail: ok ? String(actual) : `expected ${expected}, got ${actual}`,
  };
}

function inv(
  id: string,
  opts: Partial<InvoiceMatchCandidate> & { amountDue: number }
): InvoiceMatchCandidate {
  return {
    id,
    number: opts.number || id,
    status: opts.status || "authorised",
    amountDue: opts.amountDue,
    matchKeyword: opts.matchKeyword,
    customerName: opts.customerName,
    issueDate: opts.issueDate,
  };
}

function run(): Check[] {
  const checks: Check[] = [];

  const kylieOld = inv("k1", {
    number: "100",
    amountDue: 280,
    matchKeyword: "Kylie",
    customerName: "Kylie Smith",
    issueDate: "2026-07-01",
  });
  const kylieNew = inv("k2", {
    number: "101",
    amountDue: 280,
    matchKeyword: "Kylie",
    issueDate: "2026-08-01",
  });
  const steven = inv("s1", {
    number: "200",
    amountDue: 280,
    matchKeyword: "Steven",
    issueDate: "2026-06-01",
  });
  const noKeyword = inv("n1", {
    number: "INV-246",
    amountDue: 150,
    customerName: "Wagga Rugby",
    issueDate: "2026-05-01",
  });

  checks.push(
    eq(
      "no keyword never matches",
      findUniqueDepositInvoiceMatch([noKeyword], {
        amount: 150,
        description: "Wagga Rugby INV-246",
      })?.id,
      undefined
    )
  );

  checks.push(
    eq(
      "keyword plus amount matches",
      findUniqueDepositInvoiceMatch([kylieOld, steven], {
        amount: 280,
        description: "TRANSFER FROM KYLIE SMITH",
      })?.id,
      "k1"
    )
  );

  checks.push(
    eq(
      "wrong keyword does not match",
      findUniqueDepositInvoiceMatch([kylieOld], {
        amount: 280,
        description: "TRANSFER FROM STEVEN",
      })?.id,
      undefined
    )
  );

  checks.push(
    eq(
      "same amount picks oldest invoice",
      findUniqueDepositInvoiceMatch([kylieNew, kylieOld], {
        amount: 280,
        description: "Kylie",
      })?.id,
      "k1"
    )
  );

  const paired = matchDepositsToInvoices(
    [kylieNew, kylieOld, steven],
    [
      {
        key: "pay-new",
        amount: 280,
        description: "Kylie",
        date: "2026-09-10",
      },
      {
        key: "pay-old",
        amount: 280,
        description: "Direct credit Kylie",
        date: "2026-09-01",
      },
    ]
  );
  checks.push(eq("oldest payment → oldest invoice", paired.get("pay-old")?.id, "k1"));
  checks.push(eq("newer payment → newer invoice", paired.get("pay-new")?.id, "k2"));
  checks.push(eq("steven left unmatched", paired.size, 2));

  return checks;
}

const checks = run();
let failed = 0;
for (const c of checks) {
  const mark = c.ok ? "OK" : "FAIL";
  if (!c.ok) failed += 1;
  console.log(`${mark}  ${c.name}: ${c.detail}`);
}
console.log(failed ? `\n${failed} failed` : `\nAll ${checks.length} passed`);
process.exit(failed ? 1 : 0);
