/**
 * Server-side OCR for receipt photos (tesseract.js).
 * Uses vendored English data so Render does not download traineddata per request.
 */

import path from "path";
import os from "os";
import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  parseReceiptOcrText,
  type ReceiptOcrSuggestion,
} from "@/lib/accounting/parseReceiptOcr";

const OCR_TIMEOUT_MS = 12_000;

let workerPromise: Promise<Worker> | null = null;

function tessdataDir(): string {
  return path.join(process.cwd(), "vendor", "tessdata");
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
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
      const worker = await createWorker("eng", 1, {
        langPath: tessdataDir(),
        gzip: false,
        cachePath: os.tmpdir(),
        cacheMethod: "readOnly",
        logger: () => {},
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

export async function recognizeReceiptText(image: Buffer): Promise<string> {
  try {
    const worker = await withTimeout(
      getOcrWorker(),
      OCR_TIMEOUT_MS,
      "OCR startup"
    );
    const result = await withTimeout(
      worker.recognize(image),
      OCR_TIMEOUT_MS,
      "OCR read"
    );
    return String(result.data?.text || "");
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
