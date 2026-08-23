/**
 * Server-side OCR for receipt photos (tesseract.js).
 * Preprocess for thermal dockets, then read a single text column.
 */

import path from "path";
import os from "os";
import { promises as fs } from "fs";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  parseReceiptOcrText,
  type ReceiptOcrSuggestion,
} from "@/lib/accounting/parseReceiptOcr";

const OCR_STARTUP_MS = 20_000;
const OCR_READ_MS = 20_000;

let workerPromise: Promise<Worker> | null = null;

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
        // Receipts are a tall single column, not a uniform paragraph.
        tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
        tessedit_char_whitelist:
          "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz$.,:-/() ",
      });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Greyscale, contrast, upscale — thermal print on phone photos. */
export async function preprocessReceiptForOcr(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .rotate()
    .greyscale()
    .normalise()
    .linear(1.25, -16)
    .sharpen()
    .resize({
      width: 1600,
      height: 2800,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

async function binarizeReceipt(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .rotate()
    .greyscale()
    .normalise()
    .threshold(168)
    .resize({
      width: 1600,
      height: 2800,
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
    const first = await withTimeout(
      worker.recognize(prepared),
      OCR_READ_MS,
      "OCR read"
    );
    let text = String(first.data?.text || "").trim();
    if (parseReceiptOcrText(text)) return text;
    if (text.length >= 24) return text;

    const binary = await binarizeReceipt(image);
    const second = await withTimeout(
      worker.recognize(binary),
      OCR_READ_MS,
      "OCR retry"
    );
    const retry = String(second.data?.text || "").trim();
    if (!text || (retry && retry.length > text.length)) text = retry;
    return text;
  } catch (err) {
    workerPromise = null;
    throw err;
  }
}

export async function readReceiptImage(image: Buffer): Promise<{
  suggestion: ReceiptOcrSuggestion | null;
  text: string;
}> {
  const text = await recognizeReceiptText(image);
  return {
    suggestion: parseReceiptOcrText(text),
    text,
  };
}
