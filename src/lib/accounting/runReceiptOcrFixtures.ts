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
  checks.push(eq("ww lock amount", ww?.lockAmount, true));

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
  const totalOnly = parseReceiptOcrText("TOTAL $12.00");
  checks.push(eq("total-only alias empty", totalOnly?.alias, ""));
  checks.push(eq("total-only amount", totalOnly?.amount, 12));
  checks.push(eq("total-only display empty", totalOnly?.display, ""));
  checks.push(eq("total-only no lock", totalOnly?.lockAmount, true));

  const messyWw = parseReceiptOcrText(`
W00LWORTHS
COLLINGULLIE
TOTAL $79.13
EFTPOS $79.13
`);
  checks.push(eq("messy ww alias", messyWw?.alias, "ww"));
  checks.push(eq("messy ww amount", messyWw?.amount, 79.13));

  const unknownShop = parseReceiptOcrText(`
Corner Deli
Tax Invoice
TOTAL $18.50
`);
  checks.push(eq("unknown header alias empty", unknownShop?.alias, ""));
  checks.push(eq("unknown header amount", unknownShop?.amount, 18.5));
  checks.push(eq("unknown header display empty", unknownShop?.display, ""));

  const foadWw = parseReceiptOcrText(`
FOAD
THE FRESH FOAD PEOPLE
TOTAL $4.50
EFTPOS $4.50
`);
  checks.push(eq("foad ww alias", foadWw?.alias, "ww"));
  checks.push(eq("foad ww amount", foadWw?.amount, 4.5));

  const logoJunkWw = parseReceiptOcrText(`
FOAD
TOTAL $4.50
EFTPOS $4.50
`);
  checks.push(eq("logo junk not foad", logoJunkWw?.alias, ""));
  checks.push(eq("logo junk amount", logoJunkWw?.amount, 4.5));

  const danMurph = parseReceiptOcrText(`
BAS
DAN MURPHVS
LIQUOR
TOTAL $70.99
EFTPOS $70.99
`);
  checks.push(eq("dan murphys not bas", danMurph?.alias, "danmurphys"));
  checks.push(eq("dan murphys amount", danMurph?.amount, 70.99));

  const danOneWord = parseReceiptOcrText(`
DANMURPHYS
TOTAL $70.99
EFTPOS $70.99
`);
  checks.push(eq("danmurphys one word", danOneWord?.alias, "danmurphys"));

  const dollarAsFour = parseReceiptOcrText(`
Woolworths
TOTAL 405.22
EFTPOS 65.22
`);
  checks.push(eq("dollar-as-four alias", dollarAsFour?.alias, "ww"));
  checks.push(eq("dollar-as-four amount", dollarAsFour?.amount, 65.22));
  const dollarChips = (dollarAsFour?.amountCandidates || [])
    .map((c) => c.amount)
    .sort((a, b) => a - b)
    .join(",");
  checks.push(eq("dollar-as-four chips", dollarChips, "65.22"));

  const onlyFour = parseReceiptOcrText(`
TOTAL 465.22
EFTPOS 465.22
`);
  const fourAlts = (onlyFour?.amountCandidates || []).map((c) => c.amount);
  checks.push(eq("dollar-guess includes 65.22", fourAlts.includes(65.22), true));
  checks.push(eq("dollar-guess includes 465.22", fourAlts.includes(465.22), true));
  checks.push(eq("dollar-guess no lock", onlyFour?.lockAmount, false));

  const lineItems = parseReceiptOcrText(`
Woolworths
MILK 4.50
BREAD 3.99
TOTAL 8.49
EFTPOS 8.49
`);
  checks.push(eq("line items total", lineItems?.amount, 8.49));
  checks.push(eq("line items lock", lineItems?.lockAmount, true));
  const itemChips = (lineItems?.amountCandidates || []).map((c) => c.amount);
  checks.push(eq("line items chips only total", itemChips.join(","), "8.49"));

  const droppedDot = parseReceiptOcrText(`
TOTAL 8799
EFTPOS 8799
`);
  checks.push(eq("dropped decimal amount", droppedDot?.amount, 87.99));
  checks.push(eq("dropped decimal lock", droppedDot?.lockAmount, true));

  const framedBottom = parseReceiptOcrText(`
Woolworths
MILK 4.50
BREAD 12.00
TOTAL 16.50
`);
  checks.push(eq("bottom of photo amount", framedBottom?.amount, 16.5));
  checks.push(eq("bottom of photo lock", framedBottom?.lockAmount, true));
  const bottomChips = (framedBottom?.amountCandidates || []).map((c) => c.amount);
  checks.push(eq("bottom of photo chips", bottomChips.join(","), "16.5"));

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
