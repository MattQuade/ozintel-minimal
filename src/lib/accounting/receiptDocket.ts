/**
 * Hubdoc-style receipt docket fields kept in OzIntel books.
 * Sourced from Amazon Textract AnalyzeExpense (not a Xero push).
 */

export type ReceiptLineItem = {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  productCode: string | null;
};

export type ReceiptSummaryField = {
  type: string;
  label: string;
  value: string;
};

/** Structured docket detail — same class of fields Hubdoc extracts for books. */
export type ReceiptDocket = {
  vendor: string;
  vendorAddress: string;
  date: string;
  dueDate: string;
  invoiceReceiptId: string;
  abn: string;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  amountPaid: number | null;
  tip: number | null;
  discount: number | null;
  paymentMethod: string;
  cardLastFour: string;
  lineItems: ReceiptLineItem[];
  summaryFields: ReceiptSummaryField[];
  engine: "textract" | "tesseract" | "manual" | "none";
  extractedAt: string;
};

export function emptyReceiptDocket(
  engine: ReceiptDocket["engine"] = "none"
): ReceiptDocket {
  return {
    vendor: "",
    vendorAddress: "",
    date: "",
    dueDate: "",
    invoiceReceiptId: "",
    abn: "",
    currency: "",
    subtotal: null,
    tax: null,
    total: null,
    amountPaid: null,
    tip: null,
    discount: null,
    paymentMethod: "",
    cardLastFour: "",
    lineItems: [],
    summaryFields: [],
    engine,
    extractedAt: new Date().toISOString(),
  };
}

function asMoney(n: unknown): number | null {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0 || v > 999999) return null;
  return Math.round(v * 100) / 100;
}

function asText(v: unknown): string {
  return String(v || "").trim();
}

/** Accept client/server JSON and normalise into a ReceiptDocket. */
export function normalizeReceiptDocket(raw: unknown): ReceiptDocket | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const engineRaw = asText(o.engine).toLowerCase();
  const engine: ReceiptDocket["engine"] =
    engineRaw === "textract" ||
    engineRaw === "tesseract" ||
    engineRaw === "manual" ||
    engineRaw === "none"
      ? engineRaw
      : "manual";

  const lineItems: ReceiptLineItem[] = [];
  if (Array.isArray(o.lineItems)) {
    for (const row of o.lineItems) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      const description = asText(item.description);
      if (!description) continue;
      lineItems.push({
        description: description.slice(0, 240),
        quantity: asMoney(item.quantity),
        unitPrice: asMoney(item.unitPrice),
        amount: asMoney(item.amount),
        productCode: asText(item.productCode).slice(0, 64) || null,
      });
    }
  }

  const summaryFields: ReceiptSummaryField[] = [];
  if (Array.isArray(o.summaryFields)) {
    for (const row of o.summaryFields.slice(0, 80)) {
      if (!row || typeof row !== "object") continue;
      const f = row as Record<string, unknown>;
      const value = asText(f.value);
      if (!value) continue;
      summaryFields.push({
        type: asText(f.type).slice(0, 64),
        label: asText(f.label).slice(0, 80),
        value: value.slice(0, 240),
      });
    }
  }

  return {
    vendor: asText(o.vendor).slice(0, 160),
    vendorAddress: asText(o.vendorAddress).slice(0, 240),
    date: asText(o.date).slice(0, 32),
    dueDate: asText(o.dueDate).slice(0, 32),
    invoiceReceiptId: asText(o.invoiceReceiptId).slice(0, 80),
    abn: asText(o.abn).slice(0, 32),
    currency: asText(o.currency).slice(0, 8) || "AUD",
    subtotal: asMoney(o.subtotal),
    tax: asMoney(o.tax),
    total: asMoney(o.total),
    amountPaid: asMoney(o.amountPaid),
    tip: asMoney(o.tip),
    discount: asMoney(o.discount),
    paymentMethod: asText(o.paymentMethod).slice(0, 80),
    cardLastFour: asText(o.cardLastFour).slice(0, 8),
    lineItems: lineItems.slice(0, 200),
    summaryFields,
    engine,
    extractedAt: asText(o.extractedAt) || new Date().toISOString(),
  };
}

export function docketHasDetail(docket: ReceiptDocket | null | undefined): boolean {
  if (!docket) return false;
  return Boolean(
    docket.vendor ||
      docket.total != null ||
      docket.tax != null ||
      docket.date ||
      docket.invoiceReceiptId ||
      docket.lineItems.length > 0
  );
}

/** Public shape for API / UI. */
export function publicReceiptDocket(docket: ReceiptDocket | null | undefined) {
  if (!docketHasDetail(docket)) return null;
  return docket;
}
