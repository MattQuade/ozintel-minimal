/**
 * Prefer Textract's paid total when it produced a number; Tesseract for shop name
 * and as the amount fallback.
 */

import type { ApprovedMerchant } from "@/lib/accounting/approvedMerchants";
import type { TextractReceiptRead } from "@/lib/accounting/ocrTextract";
import {
  parseReceiptOcrText,
  type ReceiptAmountCandidate,
  type ReceiptOcrSuggestion,
} from "@/lib/accounting/parseReceiptOcr";

export type ChosenReceiptOcr = {
  text: string;
  engine: "tesseract" | "textract";
  suggestion: ReceiptOcrSuggestion | null;
  tessAmount: number | null;
  textractAmount: number | null;
};

function cents(amount: number): number {
  return Math.round(amount * 100);
}

function mergeCandidates(
  primary: ReceiptAmountCandidate[] | undefined,
  extra: ReceiptAmountCandidate[] | undefined
): ReceiptAmountCandidate[] {
  const out: ReceiptAmountCandidate[] = [];
  const seen = new Set<number>();
  for (const row of [...(primary || []), ...(extra || [])]) {
    const key = cents(row.amount);
    if (!Number.isFinite(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function suggestionFromMerchantAndAmount(args: {
  merchantText: string;
  amountText: string;
  merchants?: ApprovedMerchant[];
}): ReceiptOcrSuggestion | null {
  const merchantSug = parseReceiptOcrText(args.merchantText, args.merchants);
  const amountSug = parseReceiptOcrText(args.amountText, args.merchants);
  if (!amountSug && !merchantSug) return null;
  if (!amountSug?.amount) {
    return merchantSug;
  }
  if (!merchantSug?.alias) return amountSug;
  return {
    ...amountSug,
    alias: merchantSug.alias,
    merchantLabel: merchantSug.merchantLabel || amountSug.merchantLabel,
    display:
      merchantSug.alias && amountSug.amount > 0
        ? `${merchantSug.alias} ${amountSug.amount.toFixed(2)}`
        : amountSug.display,
  };
}

export function chooseReceiptOcr(args: {
  tesseractText: string;
  textract: TextractReceiptRead | null;
  merchants?: ApprovedMerchant[];
}): ChosenReceiptOcr {
  const tessSug = parseReceiptOcrText(args.tesseractText, args.merchants);
  const tessAmt = tessSug?.amount || 0;
  const tessAmount = tessAmt > 0 ? tessAmt : null;
  const hostAmt = args.textract?.total || 0;
  const textractAmount = hostAmt > 0 ? hostAmt : null;

  if (hostAmt > 0) {
    const suggestion = suggestionFromMerchantAndAmount({
      merchantText: [args.tesseractText, args.textract?.vendor || ""].join("\n"),
      amountText: `TOTAL $${hostAmt.toFixed(2)}`,
      merchants: args.merchants,
    });
    if (suggestion) {
      suggestion.lockAmount = true;
      suggestion.amountCandidates = mergeCandidates(
        [{ amount: hostAmt, score: 100 }],
        tessSug?.amountCandidates
      );
    }
    return {
      text: args.textract?.text || args.tesseractText,
      engine: "textract",
      suggestion,
      tessAmount,
      textractAmount,
    };
  }

  return {
    text: args.tesseractText,
    engine: "tesseract",
    suggestion: tessSug,
    tessAmount,
    textractAmount,
  };
}
