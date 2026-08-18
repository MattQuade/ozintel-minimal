/**
 * Worked examples for the BAS engine — sample books with known ATO-box answers.
 * Run: npx tsx src/lib/accounting/runBasFixtures.ts
 *
 * These are not ATO lodgement tests. They check that OzIntel still produces
 * the same boxes when we change the code.
 */

import { buildBasSummary } from "@/lib/accounting/reports";
import type { CoaAccount, LedgerEntry } from "@/lib/accounting/store";
import type { PayRunForBas } from "@/lib/accounting/gstTax";

const coa: CoaAccount[] = [
  { code: "0107", name: "Sales - Bar", type: "Revenue", noGST: false },
  { code: "1116", name: "Purchases - Bar", type: "Expense", noGST: false },
  { code: "1965", name: "Salaries & Wages", type: "Expense", noGST: true },
  { code: "2860", name: "Plant & Equipment", type: "Asset", isCapital: true, noGST: false },
  { code: "820", name: "GST", type: "Liability", noGST: true },
  { code: "2101", name: "Accounts Receivable", type: "Asset", noGST: true },
];

function entry(partial: Partial<LedgerEntry> & { id: string }): LedgerEntry {
  return {
    date: "2025-11-15",
    description: partial.description || partial.id,
    amount: 0,
    type: "Expense",
    ...partial,
  };
}

type Check = { name: string; ok: boolean; detail: string };

function eq(name: string, actual: number, expected: number): Check {
  const ok = Math.abs(actual - expected) < 0.02;
  return {
    name,
    ok,
    detail: ok ? `${actual}` : `expected ${expected}, got ${actual}`,
  };
}

export function runBasFixtures(): Check[] {
  const checks: Check[] = [];
  const from = "2025-10-01";
  const to = "2025-12-31";

  const invoiceSale = buildBasSummary(
    [
      entry({
        id: "inv-rev",
        type: "Revenue",
        accountCode: "0107",
        amount: -100,
        gstExclusive: true,
        gstAmount: 10,
        taxCode: "GST",
        source: "invoice",
        description: "Bar invoice ex GST",
      }),
      entry({
        id: "inv-gst",
        type: "Liability",
        accountCode: "820",
        amount: -10,
        taxCode: "N-T",
        noGST: true,
        source: "invoice",
        description: "GST control",
      }),
    ],
    coa,
    from,
    to
  );
  checks.push(eq("Invoice sale G1 incl", invoiceSale.g1TotalSales, 110));
  checks.push(eq("Invoice sale 1A", invoiceSale.gstCollected, 10));
  checks.push(eq("GST control ignored", invoiceSale.gstCollected, 10));

  const voidSale = buildBasSummary(
    [
      entry({
        id: "void-rev",
        type: "Revenue",
        accountCode: "0107",
        amount: 100,
        gstExclusive: true,
        gstAmount: 10,
        taxCode: "GST",
        source: "invoice-void",
        description: "Void invoice",
      }),
    ],
    coa,
    from,
    to
  );
  checks.push(eq("Void reverses G1", voidSale.g1TotalSales, -110));
  checks.push(eq("Void reverses 1A", voidSale.gstCollected, -10));

  const bankSpend = buildBasSummary(
    [
      entry({
        id: "bank-bar",
        type: "Expense",
        accountCode: "1116",
        amount: -110,
        taxCode: "GST",
        source: "bank-import",
        description: "Bar purchase incl GST",
      }),
    ],
    coa,
    from,
    to
  );
  checks.push(eq("Bank purchase G11 incl", bankSpend.g11NonCapitalPurchases, 110));
  checks.push(eq("Bank purchase 1B", bankSpend.gstPaid, 10));

  const capital = buildBasSummary(
    [
      entry({
        id: "plant",
        type: "Asset",
        accountCode: "2860",
        amount: 1100,
        taxCode: "CAP",
        source: "journal",
        description: "Coolroom",
      }),
    ],
    coa,
    from,
    to
  );
  checks.push(eq("Capital G10 incl", capital.g10CapitalPurchases, 1100));
  checks.push(eq("Capital 1B", capital.gstPaid, 100));

  const wages = buildBasSummary(
    [
      entry({
        id: "wages",
        type: "Expense",
        accountCode: "1965",
        amount: 2500,
        taxCode: "N-T",
        noGST: true,
        source: "payroll",
        description: "Wages",
      }),
    ],
    coa,
    from,
    to,
    [
      {
        status: "posted",
        paymentDate: "2025-11-20",
        number: "PAY-0001",
        totals: { gross: 2500, paygWithheld: 412 },
      },
    ] satisfies PayRunForBas[]
  );
  checks.push(eq("Wages not in G11", wages.g11NonCapitalPurchases, 0));
  checks.push(eq("W1 from pay run", wages.wagesTotal, 2500));
  checks.push(eq("W2 from pay run", wages.paygWithheld, 412));
  checks.push(eq("No 15% PAYG fallback", wages.paygWithheld, 412));

  const emptyPayg = buildBasSummary([], coa, from, to, []);
  checks.push(eq("W2 is zero without pay runs", emptyPayg.paygWithheld, 0));
  checks.push(eq("G2 export unused", emptyPayg.g2ExportSales, 0));
  checks.push(eq("G3 GST-free sales unused", emptyPayg.g3GstFreeSales, 0));

  return checks;
}

export function fixturesPassed(): boolean {
  return runBasFixtures().every((c) => c.ok);
}

const runningDirect = process.argv[1]
  ? process.argv[1].replace(/\\/g, "/").includes("runBasFixtures")
  : false;

if (runningDirect) {
  const checks = runBasFixtures();
  let failed = 0;
  for (const check of checks) {
    if (check.ok) {
      console.log(`ok  ${check.name} (${check.detail})`);
    } else {
      failed += 1;
      console.error(`FAIL ${check.name}: ${check.detail}`);
    }
  }
  console.log(failed ? `${failed} failed` : `All ${checks.length} BAS fixtures passed`);
  process.exit(failed ? 1 : 0);
}
