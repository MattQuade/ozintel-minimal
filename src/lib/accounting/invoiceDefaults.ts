/** Default revenue account on new invoice lines (keg / pub income). */
export const DEFAULT_INVOICE_REVENUE_CODE = "0500";

export function defaultInvoiceRevenueCode(
  accounts: Array<{ code?: string }> | undefined
): string {
  const codes = (accounts || [])
    .map((a) => String(a.code || "").trim())
    .filter(Boolean);
  if (codes.includes(DEFAULT_INVOICE_REVENUE_CODE)) {
    return DEFAULT_INVOICE_REVENUE_CODE;
  }
  return codes[0] || DEFAULT_INVOICE_REVENUE_CODE;
}
