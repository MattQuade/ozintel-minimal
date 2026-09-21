/**
 * Pick DeepSeek text when it produced a total; otherwise keep Tesseract.
 * If the two totals disagree, both stay as chips and the amount is not locked.
 */

import type { ApprovedMerchant } from "@/lib/accounting/approvedMerchants";
import {
  parseReceiptOcrText,
  type ReceiptAmountCandidate,
  type ReceiptOcrSuggestion,
} from "@/lib/accounting/parseReceiptOcr";

export type ChosenReceiptOcr = {
  text: string;
  engine: "tesseract" | "deepseek";
  suggestion: ReceiptOcrSuggestion | null;
  /** null when only one engine found an amount. */
  agree: boolean | null;
  tessAmount: number | null;
  hostedAmount: number | null;
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

function overlayMerchant(
  base: ReceiptOcrSuggestion,
  other: ReceiptOcrSuggestion | null
): ReceiptOcrSuggestion {
  if (base.alias || !other?.alias) return base;
  return {
    ...base,
    alias: other.alias,
    merchantLabel: other.merchantLabel || base.merchantLabel,
    display:
      other.alias && base.amount > 0
        ? `${other.alias} ${base.amount.toFixed(2)}`
        : base.display,
  };
}

export function suggestionFromMerchantAndAmount(args: {
  merchantText: string;
  amountText: string;
  merchants?: ApprovedMerchant[];
}): ReceiptOcrSuggestion | null {
  const merchantSug = parseReceiptOcrText(args.merchantText, args.merchants);
  const amountSug = parseReceiptOcrText(args.amountText, args.merchants);
  if (!amountSug && !merchantSug) return null;
  if (!amountSug) return merchantSug;
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
  hostedText: string;
  merchants?: ApprovedMerchant[];
}): ChosenReceiptOcr {
  const tessSug = parseReceiptOcrText(args.tesseractText, args.merchants);
  const hostSug = parseReceiptOcrText(args.hostedText, args.merchants);
  const tessAmt = tessSug?.amount || 0;
  const hostAmt = hostSug?.amount || 0;
  const tessAmount = tessAmt > 0 ? tessAmt : null;
  const hostedAmount = hostAmt > 0 ? hostAmt : null;
  const agree =
    tessAmount != null && hostedAmount != null
      ? cents(tessAmount) === cents(hostedAmount)
      : null;

  if (hostAmt > 0 && hostSug) {
    const suggestion: ReceiptOcrSuggestion = overlayMerchant(
      {
        ...hostSug,
        lockAmount: agree === false ? false : hostSug.lockAmount,
        amountCandidates: mergeCandidates(
          hostSug.amountCandidates,
          tessSug?.amountCandidates
        ),
      },
      tessSug
    );
    return {
      text: args.hostedText,
      engine: "deepseek",
      suggestion,
      agree,
      tessAmount,
      hostedAmount,
    };
  }

  if (tessSug) {
    return {
      text: args.tesseractText,
      engine: "tesseract",
      suggestion: overlayMerchant(tessSug, hostSug),
      agree,
      tessAmount,
      hostedAmount,
    };
  }

  return {
    text: args.hostedText || args.tesseractText,
    engine: args.hostedText.trim() ? "deepseek" : "tesseract",
    suggestion: hostSug,
    agree,
    tessAmount,
    hostedAmount,
  };
}
