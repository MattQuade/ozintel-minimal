/**
 * Receipt ledger numbers restart each Australian financial-year quarter.
 * Run: npx tsx src/lib/accounting/runReceiptOrderFixtures.ts
 */

import {
  auFyQuarterStart,
  ledgerNumbersCurrent,
  parseReceiptDay,
  snapSydneyDay,
  withLedgerNumbers,
  type DatedReceipt,
} from "@/lib/accounting/receiptOrder";

type Check = { name: string; ok: boolean; detail: string };

function eq(name: string, actual: unknown, expected: unknown): Check {
  const ok = actual === expected;
  return {
    name,
    ok,
    detail: ok ? String(actual) : `expected ${expected}, got ${actual}`,
  };
}

function receipt(
  id: string,
  date: string | null,
  uploadedAt: string
): DatedReceipt {
  return {
    id,
    uploadedAt,
    ...(date ? { docket: { date } } : { docket: {} }),
  };
}

function numbers(rows: DatedReceipt[]): string {
  return withLedgerNumbers(rows)
    .map((row) => `${row.id}:${row.ledgerNo}`)
    .join(",");
}

function run(): Check[] {
  const checks: Check[] = [];

  checks.push(eq("quarter 30 Jun", auFyQuarterStart("2026-06-30"), "2026-04-01"));
  checks.push(eq("quarter 1 Jul", auFyQuarterStart("2026-07-01"), "2026-07-01"));
  checks.push(eq("quarter 30 Sep", auFyQuarterStart("2026-09-30"), "2026-07-01"));
  checks.push(eq("quarter 1 Oct", auFyQuarterStart("2026-10-01"), "2026-10-01"));
  checks.push(eq("quarter 31 Dec", auFyQuarterStart("2026-12-31"), "2026-10-01"));
  checks.push(eq("quarter 1 Jan", auFyQuarterStart("2027-01-01"), "2027-01-01"));
  checks.push(eq("quarter 31 Mar", auFyQuarterStart("2027-03-31"), "2027-01-01"));
  checks.push(eq("quarter 1 Apr", auFyQuarterStart("2027-04-01"), "2027-04-01"));

  checks.push(eq("ignore receipt clock", parseReceiptDay("30/06/2026 23:59"), "2026-06-30"));
  checks.push(eq("july slash date", parseReceiptDay("01/07/2026 00:01"), "2026-07-01"));

  checks.push(
    eq(
      "snap just before 1 July Sydney",
      snapSydneyDay("2026-06-30T13:59:00.000Z"),
      "2026-06-30"
    )
  );
  checks.push(
    eq(
      "snap at 1 July Sydney",
      snapSydneyDay("2026-06-30T14:00:00.000Z"),
      "2026-07-01"
    )
  );

  const across = [
    receipt("jun", "30/06/2026", "2026-07-02T01:00:00.000Z"),
    receipt("jul", "01/07/2026", "2026-07-02T02:00:00.000Z"),
    receipt("sep", "30/09/2026", "2026-10-02T01:00:00.000Z"),
    receipt("oct", "01/10/2026", "2026-10-02T02:00:00.000Z"),
    receipt("dec", "31/12/2026", "2027-01-02T01:00:00.000Z"),
    receipt("jan", "01/01/2027", "2027-01-02T02:00:00.000Z"),
    receipt("mar", "31/03/2027", "2027-04-02T01:00:00.000Z"),
    receipt("apr", "01/04/2027", "2027-04-02T02:00:00.000Z"),
  ];
  checks.push(
    eq(
      "restart at each quarter open",
      numbers(across),
      "jun:1,jul:1,sep:2,oct:1,dec:2,jan:1,mar:2,apr:1"
    )
  );

  const sameDay = [
    receipt("later", "15/07/2026 18:45", "2026-07-15T08:00:00.000Z"),
    receipt("earlier", "15/07/2026", "2026-07-15T01:00:00.000Z"),
  ];
  checks.push(eq("same day keeps snap order", numbers(sameDay), "earlier:1,later:2"));

  const beforeInsert = [
    receipt("jul10", "10/07/2026", "2026-07-10T01:00:00.000Z"),
    receipt("jul20", "20/07/2026", "2026-07-11T01:00:00.000Z"),
    receipt("oct1", "01/10/2026", "2026-10-01T01:00:00.000Z"),
  ];
  const afterInsert = [
    ...beforeInsert,
    receipt("jul5", "05/07/2026", "2026-07-21T01:00:00.000Z"),
  ];
  checks.push(
    eq(
      "earlier date inserts inside the quarter",
      numbers(afterInsert),
      "jul5:1,jul10:2,jul20:3,oct1:1"
    )
  );

  const afterDelete = afterInsert.filter((row) => row.id !== "jul10");
  checks.push(
    eq(
      "delete closes the gap inside the quarter",
      numbers(afterDelete),
      "jul5:1,jul20:2,oct1:1"
    )
  );

  const byReceiptDate = [
    receipt("snapped-first", "02/11/2026", "2026-11-02T01:00:00.000Z"),
    receipt("dated-earlier", "01/04/2026", "2026-11-10T01:00:00.000Z"),
  ];
  checks.push(
    eq(
      "earlier receipt date comes first even when snapped later",
      numbers(byReceiptDate),
      "dated-earlier:1,snapped-first:1"
    )
  );

  const undated = [
    receipt("dated-jun", "20/06/2026", "2026-06-21T01:00:00.000Z"),
    receipt("dated-jul", "02/07/2026", "2026-07-03T01:00:00.000Z"),
    receipt("bare-jun", null, "2026-06-25T01:00:00.000Z"),
    receipt("bare-jul", null, "2026-07-04T01:00:00.000Z"),
  ];
  checks.push(
    eq(
      "undated stay after dated receipts in snap order",
      numbers(undated),
      "dated-jun:1,dated-jul:1,bare-jun:2,bare-jul:3"
    )
  );

  const numbered = withLedgerNumbers(afterInsert);
  checks.push(eq("numbers current after assign", ledgerNumbersCurrent(numbered), true));
  const stale = numbered.map((row) =>
    row.id === "jul5" ? { ...row, ledgerNo: 9 } : row
  );
  checks.push(eq("stale number is not current", ledgerNumbersCurrent(stale), false));

  return checks;
}

const results = run();
const failed = results.filter((c) => !c.ok);
for (const c of results) {
  console.log(`${c.ok ? "ok" : "FAIL"}  ${c.name}  ${c.detail}`);
}
if (failed.length) {
  console.error(`\n${failed.length} receipt order fixture(s) failed`);
  process.exit(1);
}
console.log(`\n${results.length} receipt order fixtures passed`);
