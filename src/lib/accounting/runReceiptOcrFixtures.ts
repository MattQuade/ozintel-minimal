/**
 * Fixtures for receipt OCR → caption suggestion parsing.
 * Run: npx tsx src/lib/accounting/runReceiptOcrFixtures.ts
 */

import { chooseReceiptOcr, suggestionFromMerchantAndAmount } from "@/lib/accounting/ocrChoose";
import { flattenHostedOcrText } from "@/lib/accounting/ocrHosted";
import { findLastInkRow } from "@/lib/accounting/ocrReceipt";
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

  const unlabeledBottom = parseReceiptOcrText(`
Woolworths
The fresh food people
MILK 4.50
BREAD 12.00
16.50
`);
  checks.push(eq("unlabeled bottom amount", unlabeledBottom?.amount, 16.5));
  checks.push(eq("unlabeled bottom lock", unlabeledBottom?.lockAmount, true));
  const unlabeledChips = (unlabeledBottom?.amountCandidates || []).map(
    (c) => c.amount
  );
  checks.push(eq("unlabeled bottom chips", unlabeledChips.join(","), "16.5"));

  const totalOnLeft = parseReceiptOcrText(`
Woolworths
MILK 4.50
TOTAL
65.22
`);
  checks.push(eq("total label left amount", totalOnLeft?.amount, 65.22));
  checks.push(eq("total label left lock", totalOnLeft?.lockAmount, true));

  const colesGstUnderEft = parseReceiptOcrText(`
Coles
EFT 87.40
GST INCLUDED IN TOTAL $7.95
`);
  checks.push(
    eq("coles last number is gst line", colesGstUnderEft?.amount, 7.95)
  );

  const bottomRight = parseReceiptOcrText(`
Woolworths
MILK 4.50
10.00    65.22
`);
  checks.push(eq("bottom right of last line", bottomRight?.amount, 65.22));
  checks.push(eq("bottom right lock", bottomRight?.lockAmount, true));

  const preferDecimal = parseReceiptOcrText(`
Woolworths
TOTAL $87.40
8799
`);
  checks.push(eq("prefer real dollars over later integer", preferDecimal?.amount, 87.4));

  const shopFromTop = suggestionFromMerchantAndAmount({
    merchantText: WW_SAMPLE,
    amountText: "EFTPOS $65.22",
  });
  checks.push(eq("bottom band amount", shopFromTop?.amount, 65.22));
  checks.push(eq("full page shop", shopFromTop?.alias, "ww"));

  const lastLineNotGst = suggestionFromMerchantAndAmount({
    merchantText: `Coles\nEFT 87.40\nGST INCLUDED IN TOTAL $7.95`,
    amountText: `THANK YOU\nTOTAL $87.40`,
  });
  checks.push(eq("last line total not gst", lastLineNotGst?.amount, 87.4));
  checks.push(eq("last line keeps coles", lastLineNotGst?.alias, "coles"));

  const ink = Buffer.alloc(8 * 8, 255);
  for (let x = 0; x < 8; x++) ink[5 * 8 + x] = 0;
  checks.push(eq("last ink ignores white padding", findLastInkRow(ink, 8, 8), 5));

  const deepseekTable = parseReceiptOcrText(`
# Woolworths
| Item | Price |
| Milk | 4.50 |
| **TOTAL** | 23.45 |
| GST | 2.13 |
| EFTPOS | 23.45 |
`);
  checks.push(eq("deepseek last row amount", deepseekTable?.amount, 23.45));
  checks.push(eq("deepseek last row alias", deepseekTable?.alias, "ww"));

  checks.push(
    eq(
      "flatten hosted markdown",
      flattenHostedOcrText("```markdown\n<|ref|>TOTAL $89.80<|/ref|>\n```"),
      "TOTAL $89.80"
    )
  );

  const hostedWins = chooseReceiptOcr({
    tesseractText: "TOTAL 465.22\nEFTPOS 465.22",
    hostedText: ALDI_SAMPLE,
  });
  checks.push(eq("hosted engine when it has a total", hostedWins.engine, "deepseek"));
  checks.push(eq("hosted amount preferred", hostedWins.suggestion?.amount, 89.8));
  checks.push(eq("hosted alias preferred", hostedWins.suggestion?.alias, "aldi"));
  checks.push(eq("disagree does not lock", hostedWins.suggestion?.lockAmount, false));
  checks.push(
    eq(
      "disagree keeps tesseract chip",
      (hostedWins.suggestion?.amountCandidates || []).some(
        (row) => row.amount === 465.22
      ),
      true
    )
  );

  const tessFallback = chooseReceiptOcr({
    tesseractText: WW_SAMPLE,
    hostedText: "could not read this photo",
  });
  checks.push(eq("tesseract fallback engine", tessFallback.engine, "tesseract"));
  checks.push(eq("tesseract fallback amount", tessFallback.suggestion?.amount, 231.17));

  const agreeLock = chooseReceiptOcr({
    tesseractText: ALDI_SAMPLE,
    hostedText: ALDI_SAMPLE,
  });
  checks.push(eq("agree uses deepseek", agreeLock.engine, "deepseek"));
  checks.push(eq("agree locks", agreeLock.suggestion?.lockAmount, true));
  checks.push(eq("agree flag", agreeLock.agree, true));

  const hostedShopOnly = chooseReceiptOcr({
    tesseractText: "TOTAL $18.50",
    hostedText: "Woolworths\nThank you",
  });
  checks.push(eq("hosted shop on tess total engine", hostedShopOnly.engine, "tesseract"));
  checks.push(eq("hosted shop overlay", hostedShopOnly.suggestion?.alias, "ww"));
  checks.push(eq("hosted shop keeps tess amount", hostedShopOnly.suggestion?.amount, 18.5));

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
