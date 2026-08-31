/** Pure invoice line / totals math (safe for client + server). */

export const GST_RATE = 0.1;

export type InvoiceLineLike = {
  description: string;
  quantity: number;
  unitPrice: number;
  hasGST: boolean;
  /**
   * When true, unitPrice is GST-inclusive and GST is 1/11 of the line total.
   * Older invoices omit this and store GST-exclusive unit prices.
   */
  unitPriceIncludesGst?: boolean;
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** GST embedded in a GST-inclusive amount (ATO 1/11). */
export function gstFromInclusive(incl: number): number {
  return round2((Number(incl) || 0) / 11);
}

export function exclusiveFromInclusive(
  incl: number,
  hasGST: boolean
): number {
  const n = Number(incl) || 0;
  if (!hasGST) return round2(n);
  return round2(n - gstFromInclusive(n));
}

export function inclusiveFromExclusive(
  excl: number,
  hasGST: boolean
): number {
  const n = Number(excl) || 0;
  if (!hasGST) return round2(n);
  return round2(n * (1 + GST_RATE));
}

export function formatUnitPriceInput(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(round2(n));
}

/** Editor / save: stored exclusive → GST-inclusive figure to type. */
export function storedUnitToInput(
  unitPrice: number,
  hasGST: boolean,
  pricesIncludeGst?: boolean
): string {
  const n = Number(unitPrice);
  if (!Number.isFinite(n)) return "";
  if (pricesIncludeGst || !hasGST) return formatUnitPriceInput(n);
  return formatUnitPriceInput(inclusiveFromExclusive(n, true));
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

/** Freight lines print as "Freight: N x $unit (incl.GST)". */
export function isFreightLine(line: { description?: string }): boolean {
  return /^\s*freight\b/i.test(String(line.description || ""));
}

export function linesForInvoiceMath<T extends InvoiceLineLike>(
  lines: T[] | undefined,
  pricesIncludeGst?: boolean
): Array<T & { unitPriceIncludesGst?: boolean }> {
  const list = Array.isArray(lines) ? lines : [];
  if (!pricesIncludeGst) return list;
  return list.map((l) => ({ ...l, unitPriceIncludesGst: true }));
}

/** Unit price including GST when the line is taxable. */
export function unitPriceInclGst(line: InvoiceLineLike): number {
  const unit = Number(line.unitPrice) || 0;
  if (!line.hasGST) return round2(unit);
  if (line.unitPriceIncludesGst) return round2(unit);
  return round2(unit * (1 + GST_RATE));
}

export function computeLineTotals(line: InvoiceLineLike): {
  excl: number;
  gst: number;
  incl: number;
  isDiscount: boolean;
} {
  const qty = Number(line.quantity) || 0;
  const unit = Number(line.unitPrice) || 0;
  const discount = isDiscountLine(line);

  if (line.unitPriceIncludesGst) {
    let incl = round2(qty * unit);
    if (discount) incl = -Math.abs(incl);
    const gst = line.hasGST ? gstFromInclusive(incl) : 0;
    return { excl: round2(incl - gst), gst, incl, isDiscount: discount };
  }

  let excl = round2(qty * unit);
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
  subtotalIncl: number;
  discountIncl: number;
} {
  let subtotal = 0;
  let discountTotal = 0;
  let gstTotal = 0;
  let subtotalIncl = 0;
  let discountIncl = 0;
  for (const line of lines) {
    const t = computeLineTotals(line);
    if (t.isDiscount || t.excl < 0) {
      discountTotal = round2(discountTotal + Math.abs(t.excl));
      discountIncl = round2(discountIncl + Math.abs(t.incl));
    } else {
      subtotal = round2(subtotal + t.excl);
      subtotalIncl = round2(subtotalIncl + t.incl);
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
    subtotalIncl,
    discountIncl,
  };
}
