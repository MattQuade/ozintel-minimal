/**
 * DeepSeek-OCR via Replicate. Colour JPEG in, markdown/text out.
 * Tesseract stays on as the fallback in ocrReceipt.ts.
 */

import sharp from "sharp";

const HOSTED_OCR_MS = 50_000;
const REPLICATE_MODEL = "lucataco/deepseek-ocr";

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

export function flattenHostedOcrText(raw: unknown): string {
  if (raw == null) return "";
  const text = Array.isArray(raw)
    ? raw.map((part) => String(part || "")).join("\n")
    : String(raw);
  return text
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
      withoutEnlargement: true,
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
          input: {
            image: dataUri,
            task_type: "Free OCR",
          },
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
