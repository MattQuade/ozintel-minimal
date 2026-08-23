/**
 * Worked examples for receipt-caption matching (ww 79.13 → Woolworths $79.13).
 * Run: npx tsx src/lib/accounting/runReceiptCaptionFixtures.ts
 */

import {
  captionAmountMatches,
  captionMerchantMatches,
  collapseDuplicateQuadCaptions,
  parseReceiptCaption,
  pickUniqueCaptionMatches,
} from "@/lib/accounting/receiptCaption";
import { defaultQuadCrops, quadsOverlap } from "@/lib/client/quadCrops";

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

  const grid = defaultQuadCrops();
  checks.push(eq("quad count", grid.length, 4));
  checks.push(
    eq(
      "quads do not overlap",
      [0, 1, 2, 3].every((i) =>
        [0, 1, 2, 3].every((j) => i >= j || !quadsOverlap(grid[i], grid[j]))
      ),
      true
    )
  );

  const fourWay = pickUniqueCaptionMatches(
    [
      { id: "r1", caption: "ww 79.13" },
      { id: "r2", caption: "coles 40.00" },
      { id: "r3", caption: "reddy 87.40" },
      { id: "r4", caption: "iga 12.50" },
    ],
    [
      { id: "e1", description: "WOOLWORTHS", amount: -79.13 },
      { id: "e2", description: "COLES", amount: -40 },
      { id: "e3", description: "REDDY EXPRESS", amount: -87.4 },
      { id: "e4", description: "IGA COLLINGULLIE", amount: -12.5 },
    ]
  );
  checks.push(eq("four unique crops attach", fourWay.length, 4));

  const dup = collapseDuplicateQuadCaptions([
    "woolwortt 4.50",
    "ring 4.50",
    "ww 65.22",
    "",
  ]);
  checks.push(eq("keep first duplicate total", dup.captions[0], "woolwortt 4.50"));
  checks.push(eq("blank second duplicate total", dup.captions[1], ""));
  checks.push(eq("leave other total", dup.captions[2], "ww 65.22"));
  checks.push(eq("duplicate hint set", Boolean(dup.hints[1]), true));

  const dupKnown = collapseDuplicateQuadCaptions(["ring 4.50", "ww 4.50", "", ""]);
  checks.push(eq("prefer known merchant", dupKnown.captions[0], ""));
  checks.push(eq("keep ww over ring", dupKnown.captions[1], "ww 4.50"));

  const amountOnlyDup = collapseDuplicateQuadCaptions(
    ["ww 4.50", "", "", ""],
    [4.5, 4.5, null, null]
  );
  checks.push(eq("amount-only duplicate blanked", amountOnlyDup.captions[1], ""));
  checks.push(eq("amount-only duplicate hint", Boolean(amountOnlyDup.hints[1]), true));

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
