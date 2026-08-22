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

function parseMoneyToken(whole: string, frac: string): number | null {
  const n = Number(`${whole}.${frac}`);
  if (!Number.isFinite(n) || n <= 0 || n > 99999) return null;
  return Math.round(n * 100) / 100;
}

function moneyMatchesInLine(
  line: string
): Array<{ amount: number; index: number }> {
  const out: Array<{ amount: number; index: number }> = [];
  const re = /\$?\s*(\d{1,5})[.,](\d{2})\b/g;
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
    // Ampol "CBA Chg $115.58" is the charge; "Change $0.00" is not
    if (amount >= 1) score += 30;
    else score -= 40;
  }

  const hasTotal = /\btotal\b/.test(lower);
  const includesGst = /includes?\s*g[s5]t|\([^\)]*g[s5]t[^\)]*\)/.test(lower);
  if (hasTotal && includesGst) {
    // "Total (INCL GST) $89.80" / "Total includes GST $115.58"
    score += amount >= 10 ? 58 : 5;
  } else if (hasTotal) {
    score += 50;
  }

  if (/\bg[s5]t\b/.test(lower) && !includesGst && !hasTotal) score -= 35;
  if (/\bsubtotal\b/.test(lower)) score -= 25;
  if (/\beach\b/.test(lower) || /\bqty\b/.test(lower)) score -= 15;

  // Prefer typical docket totals over tiny / huge outliers
  if (amount >= 5 && amount < 2000) score += 5;
  if (amount < 1) score -= 20;

  return score;
}

export function detectMerchantFromOcr(text: string): {
  alias: string;
  label: string;
} | null {
  const hay = normalizeOcrNoise(text).toLowerCase();
  let best: { alias: string; label: string; at: number; len: number } | null =
    null;

  for (const row of MERCHANT_DETECT) {
    for (const term of row.terms) {
      const at = hay.indexOf(term);
      if (at < 0) continue;
      const len = term.length;
      if (
        !best ||
        at < best.at ||
        (at === best.at && len > best.len)
      ) {
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
      if (!best || score > best.score || (score === best.score && amount > best.amount)) {
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

  const merchant = detectMerchantFromOcr(raw);
  const amountHit = detectAmountFromOcr(raw);
  if (!merchant || !amountHit) return null;

  const alias = normalizeReceiptAlias(merchant.alias);
  const amount = amountHit.amount;
  if (!alias || !(amount > 0)) return null;

  let confidence: ReceiptOcrSuggestion["confidence"] = "medium";
  if (amountHit.score >= 50) confidence = "high";
  else if (amountHit.score < 35) confidence = "low";

  return {
    alias,
    amount,
    display: `${alias} ${amount.toFixed(2)}`,
    merchantLabel: merchant.label,
    confidence,
    rawPreview: raw.slice(0, 240),
  };
}
