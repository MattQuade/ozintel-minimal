/**
 * Fixtures for receipt OCR → caption suggestion parsing.
 * Run: npx tsx src/lib/accounting/runReceiptOcrFixtures.ts
 */

import { parseReceiptOcrText } from "@/lib/accounting/parseReceiptOcr";

type Check = { name: string; ok: boolean; detail: string };

function eq(name: string, actual: unknown, expected: unknown): Check {
  const ok = actual === expected;
  return {
    name,
    ok,
    detail: ok ? String(actual) : `expected ${expected}, got ${actual}`,
  };
}

const WW_SAMPLE = `
Woolworths
The fresh food people
SUBTOTAL 217.17
PURCHASE $231.17
TOTAL $231.17
EFT $231.17
Change $0.00
TOTAL includes GST $3.23
`;

const ALDI_SAMPLE = `
ALD STORES
WAGGA
Total (INCL GST) $ 89.80
Card Sales $ 89.80
THANK YOU FOR SHOPPING AT ALDI
AMOUNT $89.80
`;

const AMPOL_SAMPLE = `
Ampol Retail Pty Ltd
T/As Ampol Foodary Yass
Total includes GST $ 115.58
CBA Chg $ 115.58
PURCHASE AUD $115.58
`;

const PEARL_SAMPLE = `
Welcome to Pearl Energy Sturt Hwy
P:1 PREMIUM DIESEL $56.86
Sale Total $56.86
NO CASH OUT: $56.86
PURCHASE AUD 56.86
`;

const REDDY_SAMPLE = `
REDDY EXPRESS
COLLINGULLIE
UNLEADED 91
TOTAL $87.40
EFTPOS $87.40
`;

function run(): Check[] {
  const checks: Check[] = [];

  const ww = parseReceiptOcrText(WW_SAMPLE);
  checks.push(eq("ww alias", ww?.alias, "ww"));
  checks.push(eq("ww amount", ww?.amount, 231.17));

  const aldi = parseReceiptOcrText(ALDI_SAMPLE);
  checks.push(eq("aldi alias", aldi?.alias, "aldi"));
  checks.push(eq("aldi amount", aldi?.amount, 89.8));

  const ampol = parseReceiptOcrText(AMPOL_SAMPLE);
  checks.push(eq("ampol alias", ampol?.alias, "ampol"));
  checks.push(eq("ampol amount", ampol?.amount, 115.58));

  const pearl = parseReceiptOcrText(PEARL_SAMPLE);
  checks.push(eq("pearl alias", pearl?.alias, "pe"));
  checks.push(eq("pearl amount", pearl?.amount, 56.86));

  const reddy = parseReceiptOcrText(REDDY_SAMPLE);
  checks.push(eq("reddy alias", reddy?.alias, "reddy"));
  checks.push(eq("reddy amount", reddy?.amount, 87.4));

  checks.push(
    eq("empty", parseReceiptOcrText(""), null)
  );
  checks.push(
    eq("garbage no merchant", parseReceiptOcrText("TOTAL $12.00"), null)
  );

  const messyWw = parseReceiptOcrText(`
W00LWORTHS
COLLINGULLIE
TOTAL $79.13
EFTPOS $79.13
`);
  checks.push(eq("messy ww alias", messyWw?.alias, "ww"));
  checks.push(eq("messy ww amount", messyWw?.amount, 79.13));

  const smallWw = parseReceiptOcrText(`
Woolworths
TOTAL (INCL GST) $4.50
EFTPOS $4.50
`);
  checks.push(eq("small ww 4.50 alias", smallWw?.alias, "ww"));
  checks.push(eq("small ww 4.50 amount", smallWw?.amount, 4.5));

  const garbledWw = parseReceiptOcrText(`
WOOLWORTT
TOTAL (INCL GST) $4.50
EFTPOS $4.50
`);
  checks.push(eq("garbled ww alias", garbledWw?.alias, "ww"));
  checks.push(eq("garbled ww amount", garbledWw?.amount, 4.5));

  checks.push(
    eq(
      "fragment without merchant",
      parseReceiptOcrText(`
RING YOUR BAG
TOTAL $4.50
EFTPOS $4.50
`),
      null
    )
  );

  checks.push(
    eq(
      "item name is not merchant",
      parseReceiptOcrText(`
CAPSICUM
1.00 4.50
TOTAL $46.54
EFTPOS $46.54
`),
      null
    )
  );

  const wwCapsicum = parseReceiptOcrText(`
Woolworths
CAPSICUM $4.50
TOTAL $46.54
EFTPOS $46.54
`);
  checks.push(eq("ww not capsicum", wwCapsicum?.alias, "ww"));
  checks.push(eq("ww total not item", wwCapsicum?.amount, 46.54));

  checks.push(
    eq(
      "unknown shop stays blank",
      parseReceiptOcrText(`
Corner Deli
Tax Invoice
TOTAL $18.50
`),
      null
    )
  );

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
