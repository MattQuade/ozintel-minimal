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

type BankLike = { id?: string; name?: string };

/**
 * Invoice receipts are paid into ANZ Business — never default to NAB CC.
 */
export function invoiceReceiptBankId(
  banks: BankLike[] | undefined,
  fallbackId?: string
): string {
  const list = Array.isArray(banks) ? banks : [];
  const anzBiz = list.find((b) => {
    const id = String(b.id || "");
    const name = String(b.name || "").toLowerCase();
    return id === "2030" || (/\banz\b/.test(name) && /business/.test(name));
  });
  if (anzBiz?.id) return String(anzBiz.id);
  const anyAnz = list.find((b) => /\banz\b/.test(String(b.name || "").toLowerCase()));
  if (anyAnz?.id) return String(anyAnz.id);
  const fallback = String(fallbackId || "").trim();
  if (fallback && list.some((b) => String(b.id) === fallback)) return fallback;
  return String(list[0]?.id || "");
}
