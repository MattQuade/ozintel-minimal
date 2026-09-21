/**
 * Amazon Textract AnalyzeExpense — receipt TOTAL as a labeled field.
 * Photos go to AWS in ap-southeast-2 (Sydney) when keys are set.
 */

import sharp from "sharp";
import {
  AnalyzeExpenseCommand,
  TextractClient,
} from "@aws-sdk/client-textract";

const TEXTRACT_MS = 15_000;
const IGNORE_TYPES = new Set([
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
  const decimal = text.match(/(\d{1,5})\s*[.]\s*(\d{2})\b/);
  if (decimal) {
    const n = Number(`${decimal[1]}.${decimal[2]}`);
    if (Number.isFinite(n) && n > 0 && n <= 99999) {
      return Math.round(n * 100) / 100;
    }
  }
  return null;
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

export function parseTextractExpense(raw: unknown): TextractReceiptRead {
  const empty: TextractReceiptRead = { vendor: "", total: null, tax: null, text: "" };
  if (!raw || typeof raw !== "object") return empty;
  const docs = (raw as { ExpenseDocuments?: unknown }).ExpenseDocuments;
  if (!Array.isArray(docs) || !docs.length) return empty;

  const lines: string[] = [];
  let vendor = "";
  let amountPaid: number | null = null;
  let total: number | null = null;
  let labeledPaid: number | null = null;
  let tax: number | null = null;

  for (const doc of docs) {
    if (!doc || typeof doc !== "object") continue;
    const fields = (doc as { SummaryFields?: unknown }).SummaryFields;
    if (!Array.isArray(fields)) continue;
    for (const item of fields) {
      if (!item || typeof item !== "object") continue;
      const field = item as Record<string, unknown>;
      const type = fieldType(field);
      const value = fieldValue(field);
      const label = fieldLabel(field);
      if (!value) continue;
      lines.push([type || "OTHER", label, value].filter(Boolean).join(" "));
      const money = parseMoney(value);

      if (type === "VENDOR_NAME" && !vendor) vendor = value;
      if (type === "TAX" && money != null) tax = money;
      if (IGNORE_TYPES.has(type)) continue;
      if (money == null) continue;
      if (type === "AMOUNT_PAID") amountPaid = money;
      else if (type === "TOTAL") total = money;
      else if (PAID_LABEL.test(label) && labeledPaid == null) labeledPaid = money;
    }
  }

  const paid = amountPaid ?? total ?? labeledPaid;
  return {
    vendor,
    total: paid,
    tax,
    text: lines.join("\n").trim(),
  };
}

async function prepareReceiptJpeg(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .rotate()
    .resize({
      width: 1600,
      height: 2400,
      fit: "inside",
      withoutEnlargement: false,
    })
    .jpeg({ quality: 85 })
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
    return { vendor: "", total: null, tax: null, text: "" };
  }

  const jpeg = await prepareReceiptJpeg(image);
  const ac = new AbortController();
  const kill = setTimeout(() => ac.abort(), TEXTRACT_MS);
  try {
    const out = await getClient().send(
      new AnalyzeExpenseCommand({ Document: { Bytes: jpeg } }),
      { abortSignal: ac.signal }
    );
    return parseTextractExpense(out);
  } finally {
    clearTimeout(kill);
  }
}
