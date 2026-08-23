/**
 * Turn raw OCR text from a receipt photo into caption fields (alias + amount).
 * Confirm step in the UI always remains — this only suggests.
 */

import {
  normalizeReceiptAlias,
  type ParsedReceiptCaption,
} from "@/lib/accounting/receiptCaption";

/** Detectable merchant phrases → preferred short caption alias. */
const MERCHANT_DETECT: Array<{ alias: string; terms: string[] }> = [
  { alias: "ww", terms: ["woolworths", "woolies", "woolkor"] },
  { alias: "aldi", terms: ["aldi", "ald stores", "alt stores"] },
  { alias: "coles", terms: ["coles"] },
  { alias: "iga", terms: ["iga"] },
  { alias: "reddy", terms: ["reddy express", "reddy", "reddyexpress"] },
  { alias: "ampol", terms: ["ampol", "anpol", "caltex"] },
  { alias: "bp", terms: [" bp ", "bp "] },
  { alias: "shell", terms: ["shell"] },
  { alias: "pe", terms: ["pearl energy", "pearl"] },
  { alias: "united", terms: ["united petroleum", "united"] },
  { alias: "7eleven", terms: ["7-eleven", "7 eleven", "7eleven"] },
  { alias: "bunnings", terms: ["bunnings"] },
  { alias: "officeworks", terms: ["officeworks"] },
  { alias: "bws", terms: [" bws ", "bws"] },
  { alias: "danmurphys", terms: ["dan murphy", "dan murphys"] },
  { alias: "ferndale", terms: ["ferndale"] },
];

const HEADER_STOP = new Set([
  "tax",
  "invoice",
  "receipt",
  "abn",
  "gst",
  "total",
  "subtotal",
  "amount",
  "change",
  "purchase",
  "eftpos",
  "eft",
  "card",
  "cash",
  "thank",
  "you",
  "for",
  "shopping",
  "welcome",
  "phone",
  "tel",
  "www",
  "pty",
  "ltd",
  "the",
  "and",
  "fresh",
  "food",
  "people",
]);

export type ReceiptOcrSuggestion = ParsedReceiptCaption & {
  merchantLabel: string;
  confidence: "high" | "medium" | "low";
  rawPreview: string;
};

function normalizeOcrNoise(text: string): string {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[|]/g, "I")
    .replace(/\r/g, "\n");
}

/** Fold common Tesseract letter/digit swaps for merchant matching only. */
export function foldOcrLetters(text: string): string {
  return normalizeOcrNoise(text)
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/5/g, "s")
    .replace(/\$/g, "s");
}

function parseMoneyToken(whole: string, frac: string): number | null {
  const n = Number(`${whole}.${frac}`);
  if (!Number.isFinite(n) || n <= 0 || n > 99999) return null;
  return Math.round(n * 100) / 100;
}

function moneyMatchesInLine(
  line: string
): Array<{ amount: number; index: number }> {
  const out: Array<{ amount: number; index: number }> = [];
  const re = /\$?\s*(\d{1,5})\s*[.,]\s*(\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const amount = parseMoneyToken(m[1], m[2]);
    if (amount != null) out.push({ amount, index: m.index });
  }
  return out;
}

function scoreAmountLine(line: string, amount: number): number {
  const lower = line.toLowerCase().replace(/\s+/g, " ");
  let score = 0;

  if (/\bpurchase\b/.test(lower)) score += 55;
  if (/\bsale\s*total\b/.test(lower)) score += 50;
  if (/\bcard\s*sales?\b/.test(lower)) score += 40;
  if (/\bamount\b/.test(lower) && !/\bg[s5]t\b/.test(lower)) score += 40;
  if (/\beft\b/.test(lower) || /\beftpos\b/.test(lower)) score += 42;
  if (/\baud\b/.test(lower)) score += 35;
  if (/\bno\s*cash\s*out\b/.test(lower)) score += 45;
  if (/\bcba\s*chg\b/.test(lower) || /\bchange\b/.test(lower)) {
    if (amount >= 1) score += 30;
    else score -= 40;
  }

  const hasTotal = /\btotal\b/.test(lower);
  const includesGst = /includes?\s*g[s5]t|\([^\)]*g[s5]t[^\)]*\)/.test(lower);
  if (hasTotal && includesGst) {
    score += amount >= 10 ? 58 : 5;
  } else if (hasTotal) {
    score += 50;
  }

  if (/\bg[s5]t\b/.test(lower) && !includesGst && !hasTotal) score -= 35;
  if (/\bsubtotal\b/.test(lower)) score -= 25;
  if (/\beach\b/.test(lower) || /\bqty\b/.test(lower)) score -= 15;

  if (amount >= 5 && amount < 2000) score += 5;
  if (amount < 1) score -= 20;

  return score;
}

export function detectMerchantFromOcr(text: string): {
  alias: string;
  label: string;
} | null {
  const hay = foldOcrLetters(text);
  let best: { alias: string; label: string; at: number; len: number } | null =
    null;

  for (const row of MERCHANT_DETECT) {
    for (const term of row.terms) {
      const needle = foldOcrLetters(term);
      const at = hay.indexOf(needle);
      if (at < 0) continue;
      const len = needle.length;
      if (!best || at < best.at || (at === best.at && len > best.len)) {
        best = {
          alias: row.alias,
          label: term.trim(),
          at,
          len,
        };
      }
    }
  }
  return best ? { alias: best.alias, label: best.label } : null;
}

/** First useful word on the docket when the merchant is not in the alias list. */
export function guessAliasFromHeader(text: string): string | null {
  const lines = normalizeOcrNoise(text)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);

  for (const line of lines) {
    const words = line.match(/[A-Za-z][A-Za-z']{2,}/g) || [];
    for (const word of words) {
      const alias = normalizeReceiptAlias(word);
      if (alias.length < 3) continue;
      if (HEADER_STOP.has(alias)) continue;
      if (/^\d+$/.test(alias)) continue;
      return alias;
    }
  }
  return null;
}

export function detectAmountFromOcr(text: string): {
  amount: number;
  score: number;
} | null {
  const lines = normalizeOcrNoise(text).split(/\n+/);
  let best: { amount: number; score: number } | null = null;

  for (const line of lines) {
    const matches = moneyMatchesInLine(line);
    if (!matches.length) continue;
    for (const { amount } of matches) {
      const score = scoreAmountLine(line, amount);
      if (
        !best ||
        score > best.score ||
        (score === best.score && amount > best.amount)
      ) {
        best = { amount, score };
      }
    }
  }

  if (!best || best.score < 20) return null;
  return best;
}

export function parseReceiptOcrText(
  text: string
): ReceiptOcrSuggestion | null {
  const raw = normalizeOcrNoise(text).trim();
  if (!raw) return null;

  const known = detectMerchantFromOcr(raw);
  const amountHit = detectAmountFromOcr(raw);
  if (!amountHit) return null;

  const guessed = known ? null : guessAliasFromHeader(raw);
  const alias = normalizeReceiptAlias(known?.alias || guessed || "");
  if (!alias || !(amountHit.amount > 0)) return null;

  let confidence: ReceiptOcrSuggestion["confidence"] = "medium";
  if (known && amountHit.score >= 50) confidence = "high";
  else if (!known || amountHit.score < 35) confidence = "low";

  return {
    alias,
    amount: amountHit.amount,
    display: `${alias} ${amountHit.amount.toFixed(2)}`,
    merchantLabel: known?.label || guessed || alias,
    confidence,
    rawPreview: raw.slice(0, 240),
  };
}
