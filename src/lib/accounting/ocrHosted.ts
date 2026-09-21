/**
 * PaddleOCR via Replicate. JPEG in, line text out.
 * Tesseract stays on as the fallback in ocrReceipt.ts.
 */

import sharp from "sharp";

const HOSTED_OCR_MS = 50_000;
const REPLICATE_MODEL = "hexiaochun/paddleocr";

export function hostedOcrToken(): string {
  return (
    process.env.REPLICATE_API_TOKEN?.trim() ||
    process.env.OZINTEL_OCR_REPLICATE_TOKEN?.trim() ||
    ""
  );
}

export function hostedOcrConfigured(): boolean {
  return Boolean(hostedOcrToken());
}

function paddleLineText(item: unknown): string {
  if (item == null) return "";
  if (typeof item === "string") return item.trim();
  if (Array.isArray(item)) {
    // Typical PaddleOCR row: [box, [text, confidence]]
    if (item.length >= 2) {
      const rec = item[1];
      if (typeof rec === "string") return rec.trim();
      if (Array.isArray(rec) && typeof rec[0] === "string") return rec[0].trim();
    }
    return item.map(paddleLineText).filter(Boolean).join("\n");
  }
  if (typeof item === "object") {
    const row = item as Record<string, unknown>;
    const text =
      row.text ??
      row.transcription ??
      row.rec_text ??
      row.label ??
      (row.markdown &&
      typeof row.markdown === "object" &&
      "text" in (row.markdown as object)
        ? (row.markdown as { text?: unknown }).text
        : undefined);
    if (typeof text === "string") return text.trim();
  }
  return "";
}

export function flattenHostedOcrText(raw: unknown): string {
  if (raw == null) return "";
  if (Array.isArray(raw)) {
    return raw.map(paddleLineText).filter(Boolean).join("\n").trim();
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.text === "string") return flattenHostedOcrText(obj.text);
    if (Array.isArray(obj.result)) return flattenHostedOcrText(obj.result);
    if (Array.isArray(obj.ocr_result)) return flattenHostedOcrText(obj.ocr_result);
    if (obj.markdown && typeof obj.markdown === "object") {
      const md = obj.markdown as { text?: unknown };
      if (typeof md.text === "string") return flattenHostedOcrText(md.text);
    }
    if (Array.isArray(obj.layoutParsingResults)) {
      return flattenHostedOcrText(obj.layoutParsingResults);
    }
  }
  const text = String(raw);
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return flattenHostedOcrText(JSON.parse(trimmed));
    } catch {
      // fall through and strip markdown tokens
    }
  }
  return trimmed
    .replace(/<\|[^|]*\|>/g, " ")
    .replace(/```(?:markdown|md|text)?/gi, "")
    .replace(/```/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

async function prepareReceiptJpeg(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .rotate()
    .resize({
      width: 1280,
      height: 2400,
      fit: "inside",
      withoutEnlargement: false,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function replicateJson(
  url: string,
  init: RequestInit,
  token: string
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      `HTTP ${res.status}`;
    throw new Error(`Hosted OCR ${detail}`);
  }
  return data;
}

async function waitForPrediction(
  url: string,
  token: string,
  deadline: number
): Promise<unknown> {
  while (Date.now() < deadline) {
    const data = await replicateJson(url, { method: "GET" }, token);
    const status = String(data.status || "");
    if (status === "succeeded") return data.output;
    if (status === "failed" || status === "canceled") {
      throw new Error(String(data.error || status));
    }
    await sleep(700);
  }
  throw new Error(`Hosted OCR timed out after ${Math.round(HOSTED_OCR_MS / 1000)}s`);
}

export async function recognizeReceiptTextHosted(image: Buffer): Promise<string> {
  const token = hostedOcrToken();
  if (!token) return "";

  const jpeg = await prepareReceiptJpeg(image);
  const dataUri = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  const deadline = Date.now() + HOSTED_OCR_MS;
  const ac = new AbortController();
  const kill = setTimeout(() => ac.abort(), Math.max(500, deadline - Date.now()));

  try {
    const created = await replicateJson(
      `https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`,
      {
        method: "POST",
        signal: ac.signal,
        headers: { Prefer: "wait=50" },
        body: JSON.stringify({
          input: { image: dataUri },
        }),
      },
      token
    );

    const status = String(created.status || "");
    if (status === "succeeded") {
      return flattenHostedOcrText(created.output);
    }
    if (status === "failed" || status === "canceled") {
      throw new Error(String(created.error || status));
    }
    const urls = created.urls as { get?: string } | undefined;
    const pollUrl =
      (typeof urls?.get === "string" && urls.get) ||
      (created.id
        ? `https://api.replicate.com/v1/predictions/${String(created.id)}`
        : "");
    if (!pollUrl) throw new Error("Hosted OCR returned no result");
    return flattenHostedOcrText(await waitForPrediction(pollUrl, token, deadline));
  } finally {
    clearTimeout(kill);
  }
}
