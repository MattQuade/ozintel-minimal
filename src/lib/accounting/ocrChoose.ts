/**
 * Merge shop-name text with a separate amount read.
 */

import type { ApprovedMerchant } from "@/lib/accounting/approvedMerchants";
import {
  parseReceiptOcrText,
  type ReceiptOcrSuggestion,
} from "@/lib/accounting/parseReceiptOcr";

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
