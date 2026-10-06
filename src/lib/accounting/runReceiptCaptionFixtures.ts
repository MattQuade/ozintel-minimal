/**
 * Worked examples for receipt-caption matching (ww 79.13 → Woolworths $79.13).
 * Run: npx tsx src/lib/accounting/runReceiptCaptionFixtures.ts
 */

import {
  captionAmountMatches,
  captionMerchantMatches,
  parseReceiptCaption,
  pickUniqueCaptionMatches,
} from "@/lib/accounting/receiptCaption";

type Check = { name: string; ok: boolean; detail: string };

function eq(name: string, actual: unknown, expected: unknown): Check {
  const ok = actual === expected;
  return {
    name,
    ok,
    detail: ok ? String(actual) : `expected ${expected}, got ${actual}`,
  };
}

function run(): Check[] {
  const checks: Check[] = [];
  const parsed = parseReceiptCaption("ww 79.13");
  checks.push(eq("parse alias", parsed?.alias, "ww"));
  checks.push(eq("parse amount", parsed?.amount, 79.13));
  checks.push(eq("dollar sign ok", parseReceiptCaption("WW $79.13")?.amount, 79.13));
  checks.push(eq("reject overlay prose", parseReceiptCaption("woolworths receipt"), null));

  checks.push(
    eq(
      "ww matches Woolworths description",
      captionMerchantMatches("ww", {
        description: "WOOLWORTHS COLLINGULLIE",
        category: "Woolworths Bar Purchases",
      }),
      true
    )
  );
  checks.push(
    eq(
      "ww does not match WWCC rates",
      captionMerchantMatches("ww", { description: "WWCC RATES" }),
      false
    )
  );
  checks.push(
    eq(
      "amount abs match",
      captionAmountMatches(79.13, -79.13),
      true
    )
  );

  const unique = pickUniqueCaptionMatches(
    [{ id: "r1", caption: "ww 79.13" }],
    [
      {
        id: "e1",
        description: "WOOLWORTHS COLLINGULLIE",
        amount: -79.13,
        category: "Woolworths Bar Purchases",
      },
      {
        id: "e2",
        description: "IGA COLLINGULLIE",
        amount: -12.5,
      },
    ]
  );
  checks.push(eq("unique attach", unique.length, 1));
  checks.push(eq("unique receipt", unique[0]?.receiptId, "r1"));
  checks.push(eq("unique entry", unique[0]?.entryId, "e1"));

  const ambiguous = pickUniqueCaptionMatches(
    [
      { id: "r1", caption: "ww 50.00" },
      { id: "r2", caption: "ww 50.00" },
    ],
    [
      { id: "e1", description: "WOOLWORTHS A", amount: -50 },
      { id: "e2", description: "WOOLWORTHS B", amount: -50 },
    ]
  );
  checks.push(eq("duplicate totals stay unmatched", ambiguous.length, 0));

  const alreadyLinked = pickUniqueCaptionMatches(
    [{ id: "r1", caption: "ww 79.13", ledgerEntryIds: ["old"] }],
    [{ id: "e1", description: "WOOLWORTHS", amount: -79.13 }]
  );
  checks.push(eq("skip already attached receipt", alreadyLinked.length, 0));

  checks.push(
    eq(
      "deanos alias matches apostrophe on the statement",
      captionMerchantMatches("deanos", {
        description: "DEANO'S MOBILE MECHANIC WAGGA WAGGA",
      }),
      true
    )
  );
  checks.push(
    eq(
      "full shop alias matches DEANO'S MOBILE MECHANIC",
      captionMerchantMatches("deanomobilemechanic", {
        description: "VISA DEBIT PURCHASE DEANO'S MOBILE MECHANIC WAGGA",
      }),
      true
    )
  );

  const deanos = pickUniqueCaptionMatches(
    [
      {
        id: "r-deanos",
        caption: "deanomobilemechanic 285.00",
        vendor: "Deanos Mobile Mechanic",
        receiptDate: "27/8/26",
      },
    ],
    [
      {
        id: "e-other",
        description: "SOME OTHER SUPPLIER",
        amount: -285,
        date: "2026-08-28",
      },
      {
        id: "e-deanos",
        description: "DEANO'S MOBILE MECHANIC WAGGA WAGGA",
        amount: -285,
        date: "2026-08-28",
      },
    ]
  );
  checks.push(eq("deanos $285 next-day bank line", deanos[0]?.entryId, "e-deanos"));

  const deanosDated = pickUniqueCaptionMatches(
    [
      {
        id: "r-deanos-date",
        caption: "deanos 285.00",
        vendor: "Deanos Mobile Mechanic",
        receiptDate: "2026-08-27",
      },
    ],
    [
      {
        id: "june",
        description: "DEANOS MOBILE MECHANIC",
        amount: -285,
        date: "2026-06-01",
      },
      {
        id: "aug",
        description: "DEANOS MOBILE MECHANIC",
        amount: -285,
        date: "2026-08-28",
      },
    ]
  );
  checks.push(eq("receipt 27 Aug attaches to bank 28 Aug", deanosDated[0]?.entryId, "aug"));

  const bothClose = pickUniqueCaptionMatches(
    [
      {
        id: "r-both",
        caption: "deanos 285.00",
        receiptDate: "2026-08-27",
      },
    ],
    [
      {
        id: "same-day",
        description: "DEANOS MOBILE MECHANIC",
        amount: -285,
        date: "2026-08-27",
      },
      {
        id: "next-day",
        description: "DEANOS MOBILE MECHANIC",
        amount: -285,
        date: "2026-08-28",
      },
    ]
  );
  checks.push(eq("two Deanos lines a day apart stay unmatched", bothClose.length, 0));

  return checks;
}

const results = run();
const failed = results.filter((c) => !c.ok);
for (const c of results) {
  console.log(`${c.ok ? "ok" : "FAIL"}  ${c.name}  ${c.detail}`);
}
if (failed.length) {
  console.error(`\n${failed.length} receipt caption fixture(s) failed`);
  process.exit(1);
}
console.log(`\n${results.length} receipt caption fixtures passed`);
