/** Pure invoice line / totals math (safe for client + server). */

export const GST_RATE = 0.1;

export type InvoiceLineLike = {
  description: string;
  quantity: number;
  unitPrice: number;
  hasGST: boolean;
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Discount lines reduce the invoice.
 * Detected when description contains "discount" (case-insensitive),
 * or qty / unit / extension is negative.
 */
export function isDiscountLine(line: {
  description?: string;
  quantity?: number;
  unitPrice?: number;
}): boolean {
  if (/discount/i.test(String(line.description || ""))) return true;
  const qty = Number(line.quantity) || 0;
  const unit = Number(line.unitPrice) || 0;
  return qty < 0 || unit < 0 || qty * unit < 0;
}

export function computeLineTotals(line: InvoiceLineLike): {
  excl: number;
  gst: number;
  incl: number;
  isDiscount: boolean;
} {
  const qty = Number(line.quantity) || 0;
  const unit = Number(line.unitPrice) || 0;
  let excl = round2(qty * unit);
  const discount = isDiscountLine(line);
  if (discount) {
    // Absolute extension always reduces the invoice
    excl = -Math.abs(excl);
  }
  const gst = line.hasGST ? round2(excl * GST_RATE) : 0;
  return { excl, gst, incl: round2(excl + gst), isDiscount: discount };
}

/**
 * Subtotal = positive (non-discount) lines ex-GST.
 * Discount = absolute discount lines ex-GST.
 * Net = Subtotal − Discount; GST on line bases (discount GST is negative);
 * Total = net + GST.
 */
export function computeInvoiceTotals(lines: InvoiceLineLike[]): {
  subtotal: number;
  discountTotal: number;
  netExGst: number;
  gstTotal: number;
  total: number;
} {
  let subtotal = 0;
  let discountTotal = 0;
  let gstTotal = 0;
  for (const line of lines) {
    const t = computeLineTotals(line);
    if (t.isDiscount || t.excl < 0) {
      discountTotal = round2(discountTotal + Math.abs(t.excl));
    } else {
      subtotal = round2(subtotal + t.excl);
    }
    gstTotal = round2(gstTotal + t.gst);
  }
  const netExGst = round2(subtotal - discountTotal);
  return {
    subtotal,
    discountTotal,
    netExGst,
    gstTotal,
    total: round2(netExGst + gstTotal),
  };
}
