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
  /** Only true when TOTAL/EFTPOS agree — UI should not guess otherwise. */
  lockAmount: boolean;
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

function isTotalishLine(lower: string): boolean {
  return (
    /\b(purchase|sale\s*total|card\s*sales?|eftpos|\beft\b|amount|no\s*cash\s*out|cba\s*chg|\baud\b)\b/.test(
      lower
    ) || (/\btotal\b/.test(lower) && !/\bsubtotal\b/.test(lower))
  );
}

function maskNonMoney(line: string): string {
  return line
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, " ")
    .replace(/\b\d{2}\s+\d{3}\s+\d{3}\s+\d{3}\b/g, " ")
    .replace(/\b0\d[\s-]?\d{4}[\s-]?\d{4}\b/g, " ");
}

function moneyMatchesInLine(
  line: string,
  opts?: { integerCents?: boolean }
): Array<{ amount: number; index: number }> {
  const out: Array<{ amount: number; index: number }> = [];
  const masked = maskNonMoney(line);
  const re = /\$?\s*(\d{1,5})\s*[.,]\s*(\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    const amount = parseMoneyToken(m[1], m[2]);
    if (amount != null) out.push({ amount, index: m.index });
  }

  const lower = masked.toLowerCase();
  const mostlyNumber = /^\s*\$?\s*\d{3,5}\s*$/.test(masked);
  const allowInt =
    Boolean(opts?.integerCents) || isTotalishLine(lower) || mostlyNumber;
  if (allowInt && !/[.,]\d{2}/.test(masked)) {
    const whole = masked.match(/\b(\d{3,5})\b/);
    if (whole) {
      const n = Number(whole[1]);
      const asCents = parseMoneyToken(
        String(Math.floor(n / 100)),
        String(n % 100).padStart(2, "0")
      );
      if (asCents != null) out.push({ amount: asCents, index: whole.index || 0 });
    }
  }
  return out;
}

function isFooterJunkAmount(line: string, amount: number): boolean {
  if (amount < 1) return true;
  const lower = line.toLowerCase();
  const includesGst = /includes?\s*g[s5]t|\([^\)]*g[s5]t[^\)]*\)/.test(lower);
  if (includesGst && amount < 10) return true;
  if (/\bg[s5]t\b/.test(lower) && !includesGst && amount < 15) return true;
  if (/\bchange\b/.test(lower) && amount < 1) return true;
  return false;
}

/** Last money figure in the photo, skipping GST/change footers. */
function lastUsableMoneyFromBottom(text: string): number | null {
  const lines = normalizeOcrNoise(text)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const matches = moneyMatchesInLine(lines[i], { integerCents: true });
    for (let j = matches.length - 1; j >= 0; j--) {
      const amount = matches[j].amount;
      if (isFooterJunkAmount(lines[i], amount)) continue;
      return amount;
    }
  }
  return null;
}

function chipsFromAmount(amount: number, score: number): ReceiptAmountCandidate[] {
  const out: ReceiptAmountCandidate[] = [{ amount, score }];
  const stripped = stripLeadingDollarFour(amount);
  if (
    stripped != null &&
    Math.round(stripped * 100) !== Math.round(amount * 100)
  ) {
    out.push({
      amount: stripped,
      score: Math.max(0, score - 10),
      dollarGuess: true,
    });
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

  const hasTotal = /\btotal\b/.test(lower) && !/\bsubtotal\b/.test(lower);
  const includesGst = /includes?\s*g[s5]t|\([^\)]*g[s5]t[^\)]*\)/.test(lower);
  if (hasTotal && includesGst) {
    score += amount >= 10 ? 58 : 5;
  } else if (hasTotal) {
    score += 50;
  }

  if (/\bg[s5]t\b/.test(lower) && !includesGst && !hasTotal) score -= 40;
  if (/\bsubtotal\b/.test(lower)) score -= 30;
  if (/\beach\b/.test(lower) || /\bqty\b/.test(lower) || /\b@\s/.test(lower)) {
    score -= 20;
  }
  if (/\d+\s*[x×]\s/.test(lower)) score -= 20;

  if (amount >= 5 && amount < 2000) score += 5;
  if (amount < 1) score -= 25;

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
): Array<{
  amount: number;
  score: number;
  count: number;
  totalish: boolean;
  lastLine: number;
}> {
  const lines = normalizeOcrNoise(text).split(/\n+/);
  const raw: Array<{
    amount: number;
    score: number;
    totalish: boolean;
    line: number;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    const matches = moneyMatchesInLine(line);
    const prev = i > 0 ? lines[i - 1] : "";
    const inheritTotal =
      matches.length > 0 &&
      isTotalishLine(prev.toLowerCase()) &&
      moneyMatchesInLine(prev).length === 0;
    const totalish = isTotalishLine(lower) || inheritTotal;
    if (!matches.length) continue;
    for (const { amount } of matches) {
      raw.push({
        amount,
        score: scoreAmountLine(
          totalish && !isTotalishLine(lower) ? `${prev} ${line}` : line,
          amount
        ),
        totalish,
        line: i,
      });
    }
  }

  const byCents = new Map<
    number,
    {
      amount: number;
      score: number;
      count: number;
      totalish: boolean;
      lastLine: number;
    }
  >();
  for (const row of raw) {
    const key = Math.round(row.amount * 100);
    const cur = byCents.get(key);
    if (!cur) {
      byCents.set(key, {
        amount: row.amount,
        score: row.score,
        count: 1,
        totalish: row.totalish,
        lastLine: row.totalish ? row.line : -1,
      });
    } else {
      cur.count += 1;
      cur.score = Math.max(cur.score, row.score);
      cur.totalish = cur.totalish || row.totalish;
      if (row.totalish) cur.lastLine = Math.max(cur.lastLine, row.line);
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
  const grouped = collectScoredAmounts(text)
    .filter((row) => row.totalish && row.score >= 40)
    .sort((a, b) => b.lastLine - a.lastLine || b.score - a.score);
  if (grouped.length) {
    const bottom = grouped[0];
    const out: ReceiptAmountCandidate[] = [
      {
        amount: bottom.amount,
        score: bottom.score + 30,
      },
    ];

    const pair = grouped.find(
      (row) =>
        row !== bottom &&
        (isDollarAsFourPair(bottom.amount, row.amount) ||
          isDollarAsFourPair(row.amount, bottom.amount))
    );
    if (pair) {
      out.push({ amount: pair.amount, score: pair.score });
    } else {
      const stripped = stripLeadingDollarFour(bottom.amount);
      if (
        stripped != null &&
        !out.some((c) => Math.round(c.amount * 100) === Math.round(stripped * 100))
      ) {
        out.push({
          amount: stripped,
          score: Math.max(0, bottom.score - 10),
          dollarGuess: true,
        });
      }
    }
    return out;
  }

  const fallback = lastUsableMoneyFromBottom(text);
  if (fallback == null) return [];
  return chipsFromAmount(fallback, 40);
}

export function detectAmountFromOcr(text: string): {
  amount: number;
  score: number;
  lock: boolean;
} | null {
  const candidates = collectScoredAmounts(text)
    .filter((c) => c.totalish && c.score >= 40)
    .sort((a, b) => b.lastLine - a.lastLine || b.score - a.score);

  if (candidates.length) {
    const bottom = candidates[0];
    const pair = candidates.find(
      (c) =>
        c !== bottom &&
        (isDollarAsFourPair(bottom.amount, c.amount) ||
          isDollarAsFourPair(c.amount, bottom.amount))
    );

    if (pair && isDollarAsFourPair(bottom.amount, pair.amount)) {
      return { amount: pair.amount, score: pair.score, lock: true };
    }
    if (stripLeadingDollarFour(bottom.amount) != null && !pair) {
      return { amount: bottom.amount, score: bottom.score, lock: false };
    }

    return { amount: bottom.amount, score: bottom.score, lock: true };
  }

  const fallback = lastUsableMoneyFromBottom(text);
  if (fallback == null) return null;
  if (stripLeadingDollarFour(fallback) != null) {
    return { amount: fallback, score: 40, lock: false };
  }
  return { amount: fallback, score: 40, lock: true };
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
  const lockAmount = Boolean(amountHit?.lock);

  let confidence: ReceiptOcrSuggestion["confidence"] = "medium";
  if (known && lockAmount && amountHit && amountHit.score >= 50) {
    confidence = "high";
  } else if (!known || !lockAmount || !amountHit || amountHit.score < 35) {
    confidence = "low";
  }

  return {
    alias,
    amount,
    display: alias && amount > 0 ? `${alias} ${amount.toFixed(2)}` : "",
    merchantLabel: known?.label || "",
    confidence,
    lockAmount,
    rawPreview: raw.slice(0, 240),
    amountCandidates,
  };
}
