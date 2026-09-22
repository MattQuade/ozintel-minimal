/**
 * Amazon Textract AnalyzeExpense — shop name and paid total (Sydney).
 * One AWS call. Tesseract is only used if this returns nothing.
 */

import sharp from "sharp";
import {
  AnalyzeExpenseCommand,
  TextractClient,
} from "@aws-sdk/client-textract";

const TEXTRACT_MS = 18_000;
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

function fieldConfidence(field: Record<string, unknown>): number {
  const value = field.ValueDetection as { Confidence?: unknown } | undefined;
  const n = Number(value?.Confidence);
  return Number.isFinite(n) ? n : 100;
}

export function parseTextractExpense(raw: unknown): TextractReceiptRead {
  const empty: TextractReceiptRead = {
    vendor: "",
    total: null,
    tax: null,
    text: "",
  };
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
      const conf = fieldConfidence(field);

      if (type === "VENDOR_NAME" && !vendor) vendor = value;
      if (type === "TAX" && money != null) tax = money;
      if (IGNORE_TYPES.has(type)) continue;
      if (money == null || conf < 50) continue;
      if (type === "AMOUNT_PAID") amountPaid = money;
      else if (type === "TOTAL") total = money;
      else if (PAID_LABEL.test(label) && labeledPaid == null) labeledPaid = money;
    }
  }

  return {
    vendor,
    total: amountPaid ?? total ?? labeledPaid,
    tax,
    text: lines.join("\n").trim(),
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
  };
  if (!raw || typeof raw !== "object") return empty;
  const blocks = (raw as { Blocks?: TextractBlock[] }).Blocks;
  if (!Array.isArray(blocks) || !blocks.length) return empty;

  const byId = new Map<string, TextractBlock>();
  for (const block of blocks) {
    if (block.Id) byId.set(block.Id, block);
  }

  let vendor = "";
  let paid: number | null = null;
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
    if (alias === "VENDOR") vendor = best.Text.replace(/\s+/g, " ").trim();
    if (alias === "PAID_TOTAL") paid = parseMoney(best.Text);
  }

  return { vendor, total: paid, tax: null, text: lines.join("\n").trim() };
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
    return { vendor: "", total: null, tax: null, text: "" };
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
