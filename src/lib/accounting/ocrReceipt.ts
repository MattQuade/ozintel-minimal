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

/** Bottom of the photo — about one printed line, not a 40% slab that still contains GST. */
export async function cropReceiptLastLine(image: Buffer): Promise<Buffer> {
  const upright = await sharp(image).rotate().toBuffer();
  const meta = await sharp(upright).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (width < 20 || height < 20) return upright;
  const bandH = Math.min(
    Math.max(Math.round(height * 0.06), 72),
    Math.round(height * 0.12) || height
  );
  const top = Math.max(0, height - bandH);
  return sharp(upright)
    .extract({ left: 0, top, width, height: height - top })
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
    const [amountText, merchantText] = await Promise.all([
      recognizeReceiptTextHostedSafe(bottom),
      recognizeReceiptTextSafe(image),
    ]);
    const engine: "tesseract" | "deepseek" = amountText.trim()
      ? "deepseek"
      : "tesseract";
    const suggestion = suggestionFromMerchantAndAmount({
      merchantText,
      amountText,
      merchants,
    });
    console.info("[ocr]", {
      engine,
      amountFrom: amountText.trim() ? "last-line" : "none",
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
