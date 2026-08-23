/**
 * Server-side OCR for receipt photos (tesseract.js).
 * Preprocess for thermal dockets, then read a cropped receipt block.
 */

import path from "path";
import os from "os";
import { promises as fs } from "fs";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  parseReceiptOcrText,
  receiptOcrParseQuality,
  type ReceiptOcrSuggestion,
} from "@/lib/accounting/parseReceiptOcr";

const OCR_STARTUP_MS = 20_000;
const OCR_READ_MS = 12_000;
const WHITELIST =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz$.,:-/() ";

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
      width: 1800,
      height: 3200,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

async function recognizeOnce(
  worker: Worker,
  image: Buffer,
  psm: PSM
): Promise<string> {
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    tessedit_char_whitelist: WHITELIST,
  });
  const result = await withTimeout(worker.recognize(image), OCR_READ_MS, "OCR read");
  return String(result.data?.text || "").trim();
}

export async function recognizeReceiptText(image: Buffer): Promise<string> {
  try {
    const worker = await withTimeout(
      getOcrWorker(),
      OCR_STARTUP_MS,
      "OCR startup"
    );
    const prepared = await preprocessReceiptForOcr(image);

    let bestText = "";
    let bestQuality = -1;

    const consider = async (psm: PSM) => {
      const text = await recognizeOnce(worker, prepared, psm);
      const quality = receiptOcrParseQuality(parseReceiptOcrText(text));
      if (
        quality > bestQuality ||
        (quality === bestQuality && text.length > bestText.length)
      ) {
        bestText = text;
        bestQuality = quality;
      }
      return quality;
    };

    // Cropped phone photos include table background; a single block
    // reads more reliably than assuming a perfect text column.
    const first = await consider(PSM.SINGLE_BLOCK);
    if (first < 50) {
      await consider(PSM.SPARSE_TEXT);
    }
    return bestText;
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
