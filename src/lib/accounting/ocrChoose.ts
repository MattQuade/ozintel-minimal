/**
 * Use Textract shop + paid total when AnalyzeExpense produced a number.
 * Tesseract is only the fallback.
 */

import type { ApprovedMerchant } from "@/lib/accounting/approvedMerchants";
import type { TextractReceiptRead } from "@/lib/accounting/ocrTextract";
import {
  parseReceiptOcrText,
  type ReceiptOcrSuggestion,
} from "@/lib/accounting/parseReceiptOcr";

export type ChosenReceiptOcr = {
  text: string;
  engine: "tesseract" | "textract";
  suggestion: ReceiptOcrSuggestion | null;
  tessAmount: number | null;
  textractAmount: number | null;
};

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
      merchantText: [args.textract?.vendor || "", args.textract?.text || ""].join(
        "\n"
      ),
      amountText: `TOTAL $${hostAmt.toFixed(2)}`,
      merchants: args.merchants,
    });
    if (suggestion) {
      suggestion.lockAmount = true;
      suggestion.amountCandidates = [{ amount: hostAmt, score: 100 }];
    }
    return {
      text: args.textract?.text || args.tesseractText,
      engine: "textract",
      suggestion,
      tessAmount: null,
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
