/**
 * Turn raw OCR text into a suggestion against the approved merchant list
 * plus ranked total candidates. The confirm UI always remains the lock.
 */

import { APPROVED_RECEIPT_MERCHANTS } from "@/lib/accounting/approvedMerchants";
import {
  normalizeReceiptAlias,
  type ParsedReceiptCaption,
} from "@/lib/accounting/receiptCaption";

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

export type ReceiptAmountCandidate = {
  amount: number;
  score: number;
  /** True when this value was derived by treating a leading 4 as a '$'. */
  dollarGuess?: boolean;
};

export type ReceiptOcrSuggestion = ParsedReceiptCaption & {
  merchantLabel: string;
  confidence: "high" | "medium" | "low";
  rawPreview: string;
  amountCandidates: ReceiptAmountCandidate[];
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

function compactLetters(text: string): string {
  return foldOcrLetters(text).replace(/[^a-z]/g, "");
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array<number>(n + 1);
  const cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

function compactContains(hay: string, needle: string): boolean {
  if (!needle) return false;
  if (hay.includes(needle)) return true;
  // Short keys (aldi, bws, iga, bp) must be exact — fuzzy "bas" ≠ BWS.
  if (needle.length < 6) return false;
  const maxDist = needle.length >= 10 ? 2 : 1;
  const n = needle.length;
  if (hay.length < n - maxDist) return false;
  const lo = Math.max(n - maxDist, 6);
  const hi = n + maxDist;
  for (let len = lo; len <= hi; len++) {
    if (hay.length < len) continue;
    for (let i = 0; i <= hay.length - len; i++) {
      if (editDistance(hay.slice(i, i + len), needle) <= maxDist) return true;
    }
  }
  return false;
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

/** '$65.22' often becomes '465.22' because Tesseract reads '$' as '4'. */
export function stripLeadingDollarFour(amount: number): number | null {
  if (!(amount >= 10)) return null;
  const cents = Math.round(amount * 100);
  const digits = String(cents);
  if (!digits.startsWith("4") || digits.length < 4) return null;
  const rest = Number(digits.slice(1)) / 100;
  if (!Number.isFinite(rest) || rest < 1) return null;
  return Math.round(rest * 100) / 100;
}

function isDollarAsFourPair(big: number, small: number): boolean {
  const stripped = stripLeadingDollarFour(big);
  if (stripped == null) return false;
  return Math.round(stripped * 100) === Math.round(small * 100);
}

function collectScoredAmounts(
  text: string
): Array<{ amount: number; score: number; count: number }> {
  const lines = normalizeOcrNoise(text).split(/\n+/);
  const raw: Array<{ amount: number; score: number }> = [];

  for (const line of lines) {
    const matches = moneyMatchesInLine(line);
    if (!matches.length) continue;
    for (const { amount } of matches) {
      raw.push({ amount, score: scoreAmountLine(line, amount) });
    }
  }

  const byCents = new Map<
    number,
    { amount: number; score: number; count: number }
  >();
  for (const row of raw) {
    const key = Math.round(row.amount * 100);
    const cur = byCents.get(key);
    if (!cur) {
      byCents.set(key, { amount: row.amount, score: row.score, count: 1 });
    } else {
      cur.count += 1;
      cur.score = Math.max(cur.score, row.score);
    }
  }
  return [...byCents.values()];
}

export function detectMerchantFromOcr(text: string): {
  alias: string;
  label: string;
} | null {
  const compact = compactLetters(text);
  if (!compact) return null;

  let best: { alias: string; label: string; len: number } | null = null;
  for (const row of APPROVED_RECEIPT_MERCHANTS) {
    for (const key of row.ocrKeys) {
      const needle = compactLetters(key);
      if (!compactContains(compact, needle)) continue;
      const len = needle.length;
      if (!best || len > best.len) {
        best = { alias: row.alias, label: row.label, len };
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

export function listAmountCandidates(text: string): ReceiptAmountCandidate[] {
  const grouped = collectScoredAmounts(text);
  const out: ReceiptAmountCandidate[] = grouped.map((row) => ({
    amount: row.amount,
    score: row.score + (row.count > 1 ? 15 : 0),
  }));

  for (const row of grouped) {
    const stripped = stripLeadingDollarFour(row.amount);
    if (stripped == null) continue;
    if (out.some((c) => Math.round(c.amount * 100) === Math.round(stripped * 100))) {
      continue;
    }
    out.push({
      amount: stripped,
      score: Math.max(0, row.score - 10),
      dollarGuess: true,
    });
  }

  out.sort((a, b) => b.score - a.score || b.amount - a.amount);
  return out.slice(0, 8);
}

export function detectAmountFromOcr(text: string): {
  amount: number;
  score: number;
} | null {
  const candidates = collectScoredAmounts(text).filter((c) => c.score >= 20);
  if (!candidates.length) return null;

  let consensus: { amount: number; score: number; count: number } | null = null;
  for (const row of candidates) {
    if (row.count < 2) continue;
    if (
      !consensus ||
      row.count > consensus.count ||
      (row.count === consensus.count && row.score > consensus.score)
    ) {
      consensus = row;
    }
  }

  let best = consensus || candidates[0];
  if (!consensus) {
    for (const row of candidates) {
      if (
        row.score > best.score ||
        (row.score === best.score && row.amount > best.amount)
      ) {
        best = row;
      }
    }
  }

  const pair = candidates.find(
    (c) => c.amount !== best.amount && isDollarAsFourPair(best.amount, c.amount)
  );
  if (pair) return { amount: pair.amount, score: Math.max(best.score, pair.score) };

  // $65.22 often OCRs as 405.22 ($→4) while EFTPOS still reads 65.22.
  if (best.amount >= 400 && best.amount < 500) {
    const alts = candidates.filter((c) => c.amount >= 1 && c.amount < 200);
    if (alts.length) {
      let alt = alts[0];
      for (const row of alts) {
        if (row.score > alt.score) alt = row;
      }
      return { amount: alt.amount, score: alt.score };
    }
  }

  return { amount: best.amount, score: best.score };
}

export function parseReceiptOcrText(
  text: string
): ReceiptOcrSuggestion | null {
  const raw = normalizeOcrNoise(text).trim();
  if (!raw) return null;

  const known = detectMerchantFromOcr(raw);
  const amountHit = detectAmountFromOcr(raw);
  const amountCandidates = listAmountCandidates(raw);
  if (!amountHit && !amountCandidates.length && !known) return null;

  const alias = known ? normalizeReceiptAlias(known.alias) : "";
  const amount = amountHit?.amount || amountCandidates[0]?.amount || 0;

  let confidence: ReceiptOcrSuggestion["confidence"] = "medium";
  if (known && amountHit && amountHit.score >= 50) confidence = "high";
  else if (!known || !amountHit || amountHit.score < 35) confidence = "low";

  return {
    alias,
    amount,
    display: alias && amount > 0 ? `${alias} ${amount.toFixed(2)}` : "",
    merchantLabel: known?.label || "",
    confidence,
    rawPreview: raw.slice(0, 240),
    amountCandidates,
  };
}
