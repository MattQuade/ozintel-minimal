/** Seller / bank details for print, PDF, and email (same defaults as tax invoice). */

function envText(key: string, fallback: string): string {
  const raw = process.env[key];
  if (raw == null || String(raw).trim() === "") return fallback;
  return String(raw).replace(/\\n/g, "\n").trim();
}

export const INVOICE_BRAND = {
  businessName: envText(
    "NEXT_PUBLIC_OZINTEL_BUSINESS_NAME",
    "Collingullie Hotel"
  ),
  businessAddress: envText(
    "NEXT_PUBLIC_OZINTEL_BUSINESS_ADDRESS",
    "10 Lockhart Road,\nCollingullie, NSW, 2650"
  ),
  abn: envText("NEXT_PUBLIC_OZINTEL_ABN", "79 095 176 373"),
  bankName: envText("NEXT_PUBLIC_OZINTEL_BANK_NAME", "ANZ"),
  bankAccountName: envText(
    "NEXT_PUBLIC_OZINTEL_BANK_ACCOUNT_NAME",
    "Collingullie Hotel"
  ),
  bankBsb: envText("NEXT_PUBLIC_OZINTEL_BANK_BSB", "012-823"),
  bankAccount: envText("NEXT_PUBLIC_OZINTEL_BANK_ACCOUNT", "4236-236-56"),
  defaultSubject: envText("NEXT_PUBLIC_OZINTEL_INVOICE_SUBJECT", "Draught"),
};

export function invoiceSubjectLine(raw: string | undefined): string {
  const s = String(raw || "").trim().replace(/:+\s*$/, "") ||
    INVOICE_BRAND.defaultSubject;
  return s ? `${s}:` : "";
}

export function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n) || 0);
}

export function lessLabel(description: string): string {
  const d = String(description || "").trim();
  if (/^less\s*:/i.test(d)) return d;
  if (/^discount\s*:?\s*/i.test(d)) {
    const rest = d.replace(/^discount\s*:?\s*/i, "").trim();
    return rest ? `Less: ${rest}` : "Less:";
  }
  return `Less: ${d}`;
}
