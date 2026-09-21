/**
 * Server-side OCR for receipt photos.
 * PaddleOCR (Replicate) when a token is set; Tesseract otherwise and as fallback.
 * Time out and kill the Tesseract worker so a stuck read cannot block later photos.
 */

import path from "path";
import os from "os";
import { promises as fs } from "fs";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { readMerchants } from "@/lib/accounting/merchants";
import { chooseReceiptOcr } from "@/lib/accounting/ocrChoose";
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
    console.warn("[ocr] paddle failed", err);
    return "";
  }
}

export async function readReceiptImage(image: Buffer): Promise<{
  suggestion: ReceiptOcrSuggestion | null;
  text: string;
  engine: "tesseract" | "paddle";
}> {
  const merchants = await readMerchants();
  const tesseractPromise = recognizeReceiptTextSafe(image);

  if (hostedOcrConfigured()) {
    const [hostedText, tesseractText] = await Promise.all([
      recognizeReceiptTextHostedSafe(image),
      tesseractPromise,
    ]);
    const chosen = chooseReceiptOcr({
      tesseractText,
      hostedText,
      merchants,
    });
    console.info("[ocr]", {
      engine: chosen.engine,
      agree: chosen.agree,
      tessAmount: chosen.tessAmount,
      hostedAmount: chosen.hostedAmount,
      hostedChars: hostedText.length,
    });
    return {
      suggestion: chosen.suggestion,
      text: chosen.text,
      engine: chosen.engine,
    };
  }

  const tesseractText = await tesseractPromise;
  const chosen = chooseReceiptOcr({
    tesseractText,
    hostedText: "",
    merchants,
  });
  console.info("[ocr]", {
    engine: chosen.engine,
    tessAmount: chosen.tessAmount,
  });
  return {
    suggestion: chosen.suggestion,
    text: chosen.text,
    engine: chosen.engine,
  };
}
