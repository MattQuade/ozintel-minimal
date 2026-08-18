/**
 * GST tax codes and accrual tax-point helpers.
 *
 * Method is accrual (invoice date for sales; ledger date for purchases).
 * Pub sales are GST-taxable — G2/G3 stay on the form but should be $0.
 *
 * Codes (Xero-style, mapped to ATO labels):
 *   GST  10% taxable (G1 / G11)
 *   CAP  10% capital (G10)
 *   FRE  GST-free (G3 sales / G14 purchases — unused for pub sales)
 *   EXP  GST-free export (G2 — unused for the pub)
 *   INP  input taxed (G4)
 *   N-T  out of scope (wages, PAYG, GST control, bank, AR/AP)
 */

import { GST_RATE, round2 } from "@/lib/accounting/invoiceMath";

export const GST_METHOD = "accrual" as const;

export type GstTaxCode = "GST" | "CAP" | "FRE" | "EXP" | "INP" | "N-T";

export const GST_TAX_CODES: GstTaxCode[] = [
  "GST",
  "CAP",
  "FRE",
  "EXP",
  "INP",
  "N-T",
];

export const TAX_CODE_LABELS: Record<GstTaxCode, string> = {
  GST: "GST 10%",
  CAP: "Capital (GST 10%)",
  FRE: "GST-free",
  EXP: "Export (GST-free)",
  INP: "Input taxed",
  "N-T": "Out of scope",
};

export type CoaLike = {
  code: string;
  name: string;
  type: string;
  noGST?: boolean;
  isCapital?: boolean;
  isBank?: boolean;
};

export type TaxableEntry = {
  id?: string;
  date?: string;
  description?: string;
  amount?: number;
  type?: string;
  account?: string;
  accountCode?: string;
  accountName?: string;
  source?: string;
  taxCode?: string;
  noGST?: boolean;
  hasGST?: boolean;
  gstAmount?: number;
  gstExclusive?: boolean;
  amountIncludesGst?: boolean;
};

/** Debit-positive / credit-negative sources (invoices, journals, payroll). */
const ACCOUNTING_SOURCES = new Set([
  "invoice",
  "invoice-void",
  "invoice-payment",
  "payroll",
  "journal",
]);

const NT_CODES = new Set([
  "1965",
  "1458",
  "5001",
  "804",
  "804/01",
  "805",
  "909",
  "820",
  "821",
  "822",
  "823",
  "2101",
  "3048",
  "3394",
  "3394/01",
  "4199",
  "4200",
  "960",
  "860",
  "877",
]);

export function isGstTaxCode(value: unknown): value is GstTaxCode {
  return GST_TAX_CODES.includes(String(value) as GstTaxCode);
}

export function accountCodeOf(entry: TaxableEntry): string {
  if (entry.accountCode) return String(entry.accountCode);
  if (entry.account) {
    const m = String(entry.account).match(/^(\d{3,5}(?:\/\d+)?)\b/);
    if (m) return m[1];
  }
  return "";
}

function isPayrollish(code: string, name: string): boolean {
  if (NT_CODES.has(code)) return true;
  const n = name.toLowerCase();
  return (
    n.includes("wage") ||
    n.includes("salary") ||
    n.includes("payg") ||
    n.includes("superannuation") ||
    n === "gst" ||
    n.startsWith("gst ")
  );
}

export function resolveTaxCode(
  entry: TaxableEntry,
  coaByCode: Map<string, CoaLike>
): GstTaxCode {
  if (isGstTaxCode(entry.taxCode)) return entry.taxCode;

  if (entry.gstExclusive === true) {
    const code = accountCodeOf(entry);
    const acc = code ? coaByCode.get(code) : undefined;
    if (acc?.isCapital) return "CAP";
    return "GST";
  }

  const code = accountCodeOf(entry);
  const acc = code ? coaByCode.get(code) : undefined;
  const name = String(entry.accountName || acc?.name || "").toLowerCase();
  const type = String(entry.type || acc?.type || "");

  if (acc?.isBank) return "N-T";
  if (isPayrollish(code, name)) return "N-T";
  if (type === "Equity") return "N-T";
  if (type === "Liability" && (acc?.noGST || entry.noGST)) return "N-T";
  if (type === "Asset" && acc?.isCapital && !acc.noGST) return "CAP";
  if (type === "Asset") return "N-T";

  if (acc?.isCapital && !acc.noGST) return "CAP";

  const gstOff =
    entry.noGST === true ||
    entry.hasGST === false ||
    Boolean(acc?.noGST);

  if (gstOff) {
    if (type === "Revenue" || type === "Expense") return "FRE";
    return "N-T";
  }

  return "GST";
}

function usesAccountingSigns(entry: TaxableEntry): boolean {
  return ACCOUNTING_SOURCES.has(String(entry.source || ""));
}

/** Positive = increases G1 (sales) or G10/G11 (purchases). */
export function signedMovement(entry: TaxableEntry): number {
  const raw = Number(entry.amount) || 0;
  const type = String(entry.type || "");
  if (usesAccountingSigns(entry)) {
    if (type === "Revenue") return round2(-raw);
    return round2(raw);
  }
  if (type === "Revenue") return round2(raw);
  return round2(-raw);
}

/**
 * Signed GST-exclusive equivalent: positive increases G1 (sales) or G10/G11
 * (purchases).
 */
export function signedExclusive(
  entry: TaxableEntry,
  taxCode: GstTaxCode,
  gstAbs: number
): number {
  const signed = signedMovement(entry);
  if (entry.gstExclusive === true) return round2(signed);
  if (taxCode === "GST" || taxCode === "CAP") {
    return round2(signed / (1 + GST_RATE));
  }
  return round2(signed);
}

export function signedInclusive(
  entry: TaxableEntry,
  taxCode: GstTaxCode,
  gstAbs: number
): number {
  const excl = signedExclusive(entry, taxCode, gstAbs);
  if (taxCode === "GST" || taxCode === "CAP") {
    if (entry.gstExclusive === true) {
      const sign = excl < 0 ? -1 : 1;
      return round2(excl + sign * gstAbs);
    }
    return signedMovement(entry);
  }
  return excl;
}

export function gstAbsOnLine(
  entry: TaxableEntry,
  taxCode: GstTaxCode
): number {
  if (taxCode !== "GST" && taxCode !== "CAP") return 0;
  if (typeof entry.gstAmount === "number" && Number.isFinite(entry.gstAmount)) {
    return round2(Math.abs(entry.gstAmount));
  }
  const abs = Math.abs(Number(entry.amount) || 0);
  if (abs < 0.005) return 0;
  if (entry.gstExclusive === true) return round2(abs * GST_RATE);
  return round2(abs - abs / (1 + GST_RATE));
}

/** GST $ with the same sign as the inclusive movement (sales + / purchases +). */
export function signedGst(
  entry: TaxableEntry,
  taxCode: GstTaxCode,
  gstAbs: number,
  signedIncl: number
): number {
  if (gstAbs < 0.005) return 0;
  if (signedIncl < 0) return round2(-gstAbs);
  return gstAbs;
}

export function stampLedgerGstFields(
  entry: TaxableEntry,
  coa: CoaLike[]
): {
  taxCode: GstTaxCode;
  gstAmount: number;
  noGST: boolean;
  hasGST: boolean;
  amountIncludesGst: boolean;
} {
  const coaByCode = new Map(coa.map((a) => [a.code, a]));
  const taxCode = resolveTaxCode(entry, coaByCode);
  const gstAmount = gstAbsOnLine(entry, taxCode);
  const taxable = taxCode === "GST" || taxCode === "CAP";
  return {
    taxCode,
    gstAmount,
    noGST: !taxable,
    hasGST: taxable,
    amountIncludesGst: entry.gstExclusive === true ? false : taxable,
  };
}

export type BasBoxId =
  | "G1"
  | "G2"
  | "G3"
  | "G4"
  | "G5"
  | "G6"
  | "G7"
  | "G8"
  | "G9"
  | "G10"
  | "G11"
  | "1A"
  | "1B"
  | "W1"
  | "W2";

export type BasSourceLine = {
  id: string;
  date: string;
  description: string;
  accountCode: string;
  accountName: string;
  taxCode: GstTaxCode;
  amount: number;
  gstAmount: number;
  source: string;
};

export type PayRunForBas = {
  status: string;
  paymentDate: string;
  periodStart?: string;
  periodEnd?: string;
  number?: string;
  totals: { gross: number; paygWithheld: number };
};
