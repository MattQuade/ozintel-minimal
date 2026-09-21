/**
 * Server-side OCR for receipt photos.
 * DeepSeek (Replicate) when a token is set; Tesseract otherwise and as fallback.
 * Time out and kill the Tesseract worker so a stuck read cannot block later photos.
 */

import path from "path";
import os from "os";
import { promises as fs } from "fs";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { readMerchants } from "@/lib/accounting/merchants";
import {
  suggestionFromMerchantAndAmount,
} from "@/lib/accounting/ocrChoose";
import {
  hostedOcrConfigured,
  recognizeReceiptTextHosted,
} from "@/lib/accounting/ocrHosted";
import type { ReceiptOcrSuggestion } from "@/lib/accounting/parseReceiptOcr";

const OCR_STARTUP_MS = 12_000;
const OCR_READ_MS = 8_000;

let workerPromise: Promise<Worker> | null = null;
let workerRef: Worker | null = null;

function tessdataDir(): string {
  return path.join(process.cwd(), "vendor", "tessdata");
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function killWorker(): void {
  const worker = workerRef;
  workerRef = null;
  workerPromise = null;
  if (!worker) return;
  // Do not await terminate — it can hang if WASM is wedged, and that
  // would block every later receipt on this Render instance.
  void Promise.race([
    worker.terminate(),
    new Promise<void>((resolve) => setTimeout(resolve, 1500)),
  ]).catch(() => undefined);
}

async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const langFile = path.join(tessdataDir(), "eng.traineddata");
      await fs.access(langFile);
      const worker = await createWorker("eng", 1, {
        langPath: tessdataDir(),
        gzip: false,
        cachePath: os.tmpdir(),
        cacheMethod: "readOnly",
        logger: () => {},
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        tessedit_char_whitelist:
          "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,:-/() ",
      });
      workerRef = worker;
      return worker;
    })().catch((err) => {
      workerPromise = null;
      workerRef = null;
      throw err;
    });
  }
  return workerPromise;
}

export async function preprocessReceiptForOcr(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .rotate()
    .greyscale()
    .normalise()
    .sharpen()
    .resize({
      width: 1400,
      height: 2400,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

export async function recognizeReceiptText(image: Buffer): Promise<string> {
  try {
    const worker = await withTimeout(
      getOcrWorker(),
      OCR_STARTUP_MS,
      "OCR startup"
    );
    const prepared = await preprocessReceiptForOcr(image);
    const result = await withTimeout(
      worker.recognize(prepared),
      OCR_READ_MS,
      "OCR read"
    );
    return String(result.data?.text || "").trim();
  } catch (err) {
    killWorker();
    throw err;
  }
}

/** Last row with enough dark pixels — ignores white padding under the docket. */
export function findLastInkRow(
  data: Buffer | Uint8Array,
  width: number,
  height: number
): number {
  const threshold = 210;
  const minDark = Math.max(8, Math.round(width * 0.015));
  for (let y = height - 1; y >= 0; y--) {
    let dark = 0;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[row + x] < threshold) {
        dark += 1;
        if (dark >= minDark) return y;
      }
    }
  }
  return height - 1;
}

/** Last printed line of the docket, not the last 6% of a photo that is mostly padding. */
export async function cropReceiptLastLine(image: Buffer): Promise<Buffer> {
  const upright = await sharp(image).rotate().toBuffer();
  const { data, info } = await sharp(upright)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width || 0;
  const height = info.height || 0;
  if (width < 20 || height < 20) return upright;
  const contentBottom = findLastInkRow(data, width, height);
  const lineH = Math.min(
    Math.max(Math.round(height * 0.08), 140),
    260,
    contentBottom + 1
  );
  const top = Math.max(0, contentBottom - lineH + 1);
  return sharp(upright)
    .extract({ left: 0, top, width, height: contentBottom - top + 1 })
    .toBuffer();
}

async function recognizeReceiptTextSafe(image: Buffer): Promise<string> {
  try {
    return await recognizeReceiptText(image);
  } catch (err) {
    console.warn("[ocr] tesseract failed", err);
    return "";
  }
}

async function recognizeReceiptTextHostedSafe(image: Buffer): Promise<string> {
  try {
    return await recognizeReceiptTextHosted(image);
  } catch (err) {
    console.warn("[ocr] deepseek failed", err);
    return "";
  }
}

export async function readReceiptImage(image: Buffer): Promise<{
  suggestion: ReceiptOcrSuggestion | null;
  text: string;
  engine: "tesseract" | "deepseek";
}> {
  const merchants = await readMerchants();
  const bottom = await cropReceiptLastLine(image);

  if (hostedOcrConfigured()) {
    const [hostedLast, merchantText] = await Promise.all([
      recognizeReceiptTextHostedSafe(bottom),
      recognizeReceiptTextSafe(image),
    ]);
    let amountText = hostedLast;
    let engine: "tesseract" | "deepseek" = hostedLast.trim()
      ? "deepseek"
      : "tesseract";
    let suggestion = suggestionFromMerchantAndAmount({
      merchantText,
      amountText,
      merchants,
    });
    if (!suggestion?.amount) {
      const tessLast = await recognizeReceiptTextSafe(bottom);
      if (tessLast.trim()) {
        amountText = tessLast;
        engine = "tesseract";
        suggestion = suggestionFromMerchantAndAmount({
          merchantText,
          amountText,
          merchants,
        });
      }
    }
    console.info("[ocr]", {
      engine,
      amountFrom: suggestion?.amount ? "last-printed-line" : "none",
      amount: suggestion?.amount || null,
      alias: suggestion?.alias || null,
    });
    return {
      suggestion,
      text: `${merchantText}\n${amountText}`.trim(),
      engine,
    };
  }

  const amountText = await recognizeReceiptTextSafe(bottom);
  const merchantText = await recognizeReceiptTextSafe(image);
  const suggestion = suggestionFromMerchantAndAmount({
    merchantText,
    amountText,
    merchants,
  });
  console.info("[ocr]", {
    engine: "tesseract",
    amountFrom: "last-line",
    amount: suggestion?.amount || null,
    alias: suggestion?.alias || null,
  });
  return {
    suggestion,
    text: `${merchantText}\n${amountText}`.trim(),
    engine: "tesseract",
  };
}
