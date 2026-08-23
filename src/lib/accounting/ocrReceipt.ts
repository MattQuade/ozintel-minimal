/**
 * Server-side OCR for receipt photos (tesseract.js).
 * One pass on a full-frame phone photo. Caption confirm always stays manual.
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
const OCR_READ_MS = 12_000;

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
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        tessedit_char_whitelist:
          "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,:-/() ",
      });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Start Tesseract on the capture page so the first photo is not a cold boot. */
export async function warmOcrWorker(): Promise<void> {
  await withTimeout(getOcrWorker(), OCR_STARTUP_MS, "OCR startup");
}

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
