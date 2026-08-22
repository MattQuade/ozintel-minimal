/**
 * Server-side OCR for receipt photos (tesseract.js).
 * Language data is fetched once per process; worker is reused.
 */

import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  parseReceiptOcrText,
  type ReceiptOcrSuggestion,
} from "@/lib/accounting/parseReceiptOcr";

let workerPromise: Promise<Worker> | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker("eng", 1, {
        logger: () => {},
      });
      await worker.setParameters({
        // Uniform block of text — suits tall thermal dockets
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
  const worker = await getOcrWorker();
  const result = await worker.recognize(image);
  return String(result.data?.text || "");
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
