/**
 * Amazon Textract AnalyzeExpense — Hubdoc-style docket fields (Sydney).
 * Shop, totals, GST, dates, invoice #, payment, and line items.
 * Tesseract is only used if this returns nothing useful.
 */

import {
  AnalyzeExpenseCommand,
  TextractClient,
} from "@aws-sdk/client-textract";
import {
  emptyReceiptDocket,
  type ReceiptDocket,
  type ReceiptLineItem,
  type ReceiptSummaryField,
} from "@/lib/accounting/receiptDocket";

const TEXTRACT_MS = 18_000;
const IGNORE_FOR_TOTAL = new Set([
  "TAX",
  "SUBTOTAL",
  "GRATUITY",
  "DISCOUNT",
  "SERVICE_CHARGE",
  "PRIOR_BALANCE",
  "SHIPPING_HANDLING_CHARGE",
]);
const PAID_LABEL = /\b(eftpos|purchase|amount\s*paid|card\s*sales?|amount)\b/i;

export type TextractReceiptRead = {
  vendor: string;
  total: number | null;
  tax: number | null;
  text: string;
  docket: ReceiptDocket;
};

export function textractConfigured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim()
  );
}

export function textractRegion(): string {
  return process.env.AWS_REGION?.trim() || "ap-southeast-2";
}

function parseMoney(raw: string): number | null {
  const text = String(raw || "").replace(/,/g, "");
  const decimal = text.match(/(\d{1,6})\s*[.]\s*(\d{2})\b/);
  if (decimal) {
    const n = Number(`${decimal[1]}.${decimal[2]}`);
    if (Number.isFinite(n) && n >= 0 && n <= 999999) {
      return Math.round(n * 100) / 100;
    }
  }
  return null;
}

function parseQuantity(raw: string): number | null {
  const text = String(raw || "").replace(/,/g, "").trim();
  const m = text.match(/^-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n) || n < 0 || n > 99999) return null;
  return Math.round(n * 1000) / 1000;
}

function fieldType(field: Record<string, unknown>): string {
  const type = field.Type as { Text?: unknown } | undefined;
  return String(type?.Text || "").trim().toUpperCase();
}

function fieldValue(field: Record<string, unknown>): string {
  const value = field.ValueDetection as { Text?: unknown } | undefined;
  return String(value?.Text || "").trim();
}

function fieldLabel(field: Record<string, unknown>): string {
  const label = field.LabelDetection as { Text?: unknown } | undefined;
  return String(label?.Text || "").trim();
}

function fieldConfidence(field: Record<string, unknown>): number {
  const value = field.ValueDetection as { Confidence?: unknown } | undefined;
  const n = Number(value?.Confidence);
  return Number.isFinite(n) ? n : 100;
}

function extractAbn(text: string): string {
  const m = String(text || "").match(
    /\b(?:ABN[:\s]*)?(\d{2}\s?\d{3}\s?\d{3}\s?\d{3})\b/i
  );
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function normalizeDate(raw: string): string {
  const t = String(raw || "").trim();
  if (!t) return "";
  // Keep AU-style and ISO as printed; Hubdoc also keeps source date text.
  return t.slice(0, 32);
}

function parseLineItemFields(
  fields: unknown[]
): ReceiptLineItem | null {
  let description = "";
  let quantity: number | null = null;
  let unitPrice: number | null = null;
  let amount: number | null = null;
  let productCode: string | null = null;
  let expenseRow = "";

  for (const item of fields) {
    if (!item || typeof item !== "object") continue;
    const field = item as Record<string, unknown>;
    const type = fieldType(field);
    const value = fieldValue(field);
    if (!value) continue;
    if (type === "ITEM" || type === "PRODUCT_NAME") {
      if (!description) description = value;
    } else if (type === "QUANTITY") {
      quantity = parseQuantity(value);
    } else if (type === "UNIT_PRICE" || type === "PRICE") {
      const money = parseMoney(value);
      if (type === "UNIT_PRICE" && money != null) unitPrice = money;
      else if (type === "PRICE" && money != null) amount = money;
    } else if (type === "PRODUCT_CODE") {
      productCode = value;
    } else if (type === "EXPENSE_ROW") {
      expenseRow = value;
    }
  }

  if (!description && expenseRow) {
    // "MILK 2.50" style row — split trailing money as amount.
    const m = expenseRow.match(/^(.*?)(\d+[.,]\d{2})\s*$/);
    if (m) {
      description = m[1].replace(/[\s.$]+$/, "").trim();
      amount = parseMoney(m[2]);
    } else {
      description = expenseRow;
    }
  }

  description = description.replace(/\s+/g, " ").trim();
  if (!description) return null;
  // Skip summary-like rows that leaked into line items.
  if (/^(total|subtotal|gst|tax|eftpos|amount\s*paid|change)\b/i.test(description)) {
    return null;
  }

  return {
    description: description.slice(0, 240),
    quantity,
    unitPrice,
    amount,
    productCode,
  };
}

export function parseTextractExpense(raw: unknown): TextractReceiptRead {
  const docket = emptyReceiptDocket("textract");
  const empty: TextractReceiptRead = {
    vendor: "",
    total: null,
    tax: null,
    text: "",
    docket: emptyReceiptDocket("none"),
  };
  if (!raw || typeof raw !== "object") return empty;
  const docs = (raw as { ExpenseDocuments?: unknown }).ExpenseDocuments;
  if (!Array.isArray(docs) || !docs.length) return empty;

  const summaryFields: ReceiptSummaryField[] = [];
  const lines: string[] = [];
  let amountPaid: number | null = null;
  let total: number | null = null;
  let labeledPaid: number | null = null;

  for (const doc of docs) {
    if (!doc || typeof doc !== "object") continue;
    const fields = (doc as { SummaryFields?: unknown }).SummaryFields;
    if (Array.isArray(fields)) {
      for (const item of fields) {
        if (!item || typeof item !== "object") continue;
        const field = item as Record<string, unknown>;
        const type = fieldType(field);
        const value = fieldValue(field);
        const label = fieldLabel(field);
        if (!value) continue;
        summaryFields.push({ type, label, value });
        lines.push([type || "OTHER", label, value].filter(Boolean).join(" "));
        const money = parseMoney(value);
        const conf = fieldConfidence(field);

        if (type === "VENDOR_NAME" && !docket.vendor) docket.vendor = value;
        if (type === "VENDOR_ADDRESS" && !docket.vendorAddress) {
          docket.vendorAddress = value;
        }
        if (type === "INVOICE_RECEIPT_DATE" && !docket.date) {
          docket.date = normalizeDate(value);
        }
        if (type === "DUE_DATE" && !docket.dueDate) {
          docket.dueDate = normalizeDate(value);
        }
        if (type === "INVOICE_RECEIPT_ID" && !docket.invoiceReceiptId) {
          docket.invoiceReceiptId = value;
        }
        if ((type === "VENDOR_ABN" || type === "ABN") && !docket.abn) {
          docket.abn = extractAbn(value) || value;
        }
        if (type === "CURRENCY" || type === "CURRENCY_CODE") {
          if (!docket.currency) docket.currency = value.replace(/[^A-Za-z]/g, "").toUpperCase();
        }
        if (type === "PAYMENT_METHOD" || type === "PAYMENT_TYPE") {
          if (!docket.paymentMethod) docket.paymentMethod = value;
        }
        if (type === "CARD_NUMBER" || type === "ACCOUNT_NUMBER") {
          const last4 = value.replace(/\D/g, "").slice(-4);
          if (last4 && !docket.cardLastFour) docket.cardLastFour = last4;
        }
        if (type === "TAX" && money != null) docket.tax = money;
        if (type === "SUBTOTAL" && money != null) docket.subtotal = money;
        if (type === "GRATUITY" && money != null) docket.tip = money;
        if (type === "DISCOUNT" && money != null) docket.discount = money;
        if (type === "AMOUNT_PAID" && money != null) {
          amountPaid = money;
          docket.amountPaid = money;
        }
        if (type === "TOTAL" && money != null) {
          total = money;
          docket.total = money;
        }
        if (
          !IGNORE_FOR_TOTAL.has(type) &&
          money != null &&
          conf >= 50 &&
          PAID_LABEL.test(label) &&
          labeledPaid == null
        ) {
          labeledPaid = money;
        }
        if (!docket.abn) {
          const abn = extractAbn(value) || extractAbn(label);
          if (abn) docket.abn = abn;
        }
      }
    }

    const groups = (doc as { LineItemGroups?: unknown }).LineItemGroups;
    if (Array.isArray(groups)) {
      for (const group of groups) {
        if (!group || typeof group !== "object") continue;
        const lineItems = (group as { LineItems?: unknown }).LineItems;
        if (!Array.isArray(lineItems)) continue;
        for (const line of lineItems) {
          if (!line || typeof line !== "object") continue;
          const lineFields = (line as { LineItemExpenseFields?: unknown })
            .LineItemExpenseFields;
          if (!Array.isArray(lineFields)) continue;
          const parsed = parseLineItemFields(lineFields);
          if (parsed) docket.lineItems.push(parsed);
        }
      }
    }
  }

  const paidTotal = amountPaid ?? total ?? labeledPaid;
  docket.total = docket.total ?? paidTotal;
  docket.amountPaid = docket.amountPaid ?? amountPaid ?? paidTotal;
  docket.summaryFields = summaryFields;
  if (!docket.currency) docket.currency = "AUD";
  docket.lineItems = docket.lineItems.slice(0, 200);

  return {
    vendor: docket.vendor,
    total: paidTotal,
    tax: docket.tax,
    text: lines.join("\n").trim(),
    docket,
  };
}

type TextractBlock = {
  Id?: string;
  BlockType?: string;
  Text?: string;
  Confidence?: number;
  Query?: { Text?: string; Alias?: string };
  Relationships?: Array<{ Type?: string; Ids?: string[] }>;
};

function isGstOnlyAnswer(text: string): boolean {
  const lower = String(text || "").toLowerCase();
  if (!/\bgst\b/.test(lower)) return false;
  return !/\b(total|eftpos|purchase|amount\s*paid)\b/.test(lower);
}

/** Fixture helper for Q&A-shaped Textract output. */
export function parseTextractQueries(raw: unknown): TextractReceiptRead {
  const empty: TextractReceiptRead = {
    vendor: "",
    total: null,
    tax: null,
    text: "",
    docket: emptyReceiptDocket("none"),
  };
  if (!raw || typeof raw !== "object") return empty;
  const blocks = (raw as { Blocks?: TextractBlock[] }).Blocks;
  if (!Array.isArray(blocks) || !blocks.length) return empty;

  const byId = new Map<string, TextractBlock>();
  for (const block of blocks) {
    if (block.Id) byId.set(block.Id, block);
  }

  const docket = emptyReceiptDocket("textract");
  const lines: string[] = [];

  for (const block of blocks) {
    if (block.BlockType !== "QUERY") continue;
    const alias = String(block.Query?.Alias || "").toUpperCase();
    const answerIds = (block.Relationships || [])
      .filter((rel) => rel.Type === "ANSWER")
      .flatMap((rel) => rel.Ids || []);
    let best: TextractBlock | undefined;
    for (const id of answerIds) {
      const answer = byId.get(id);
      if (answer?.BlockType !== "QUERY_RESULT" || !answer.Text) continue;
      if (alias === "PAID_TOTAL" && isGstOnlyAnswer(answer.Text)) continue;
      if (!best || (answer.Confidence || 0) > (best.Confidence || 0)) {
        best = answer;
      }
    }
    if (!best?.Text) continue;
    lines.push(`${alias} ${best.Text}`);
    if (alias === "VENDOR") docket.vendor = best.Text.replace(/\s+/g, " ").trim();
    if (alias === "PAID_TOTAL") {
      const paid = parseMoney(best.Text);
      docket.total = paid;
      docket.amountPaid = paid;
    }
  }

  return {
    vendor: docket.vendor,
    total: docket.total,
    tax: null,
    text: lines.join("\n").trim(),
    docket,
  };
}

async function prepareReceiptJpeg(image: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(image)
    .rotate()
    .resize({
      width: 1600,
      height: 2400,
      fit: "inside",
      withoutEnlargement: false,
    })
    .jpeg({ quality: 40 })
    .toBuffer();
}

let client: TextractClient | null = null;

function getClient(): TextractClient {
  if (!client) {
    client = new TextractClient({ region: textractRegion() });
  }
  return client;
}

export async function recognizeReceiptTextract(
  image: Buffer
): Promise<TextractReceiptRead> {
  if (!textractConfigured()) {
    return {
      vendor: "",
      total: null,
      tax: null,
      text: "",
      docket: emptyReceiptDocket("none"),
    };
  }

  const jpeg = await prepareReceiptJpeg(image);
  const ac = new AbortController();
  const kill = setTimeout(() => ac.abort(), TEXTRACT_MS);
  try {
    const out = await getClient().send(
      new AnalyzeExpenseCommand({
        Document: { Bytes: new Uint8Array(jpeg) },
      }),
      { abortSignal: ac.signal }
    );
    const parsed = parseTextractExpense(out);
    console.info("[ocr] textract fields", {
      vendor: parsed.vendor || null,
      total: parsed.total,
      tax: parsed.tax,
      lines: parsed.docket.lineItems.length,
      chars: parsed.text.length,
    });
    return parsed;
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.warn("[ocr] textract failed", e.name || "", e.message || err);
    throw err;
  } finally {
    clearTimeout(kill);
  }
}
