/**
 * Receipt inbox captions, e.g. "ww 79.13".
 * Alias is typed in the app; matcher uses it against the bank description.
 */

import { approvedAliasBankTerms } from "@/lib/accounting/approvedMerchants";

export type ParsedReceiptCaption = {
  alias: string;
  amount: number;
  display: string;
};

const ALIAS_TERMS: Record<string, string[]> = approvedAliasBankTerms();

function cents(n: number): number {
  return Math.round((Number(n) || 0) * 100);
}

export function normalizeReceiptAlias(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function parseReceiptCaption(
  input: string
): ParsedReceiptCaption | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const m = raw.match(
    /^([A-Za-z][A-Za-z0-9.&'/-]{0,31})\s*\$?\s*(\d{1,7}(?:\.\d{1,2})?)\s*$/
  );
  if (!m) return null;
  const alias = normalizeReceiptAlias(m[1]);
  const amount = Number(m[2]);
  if (!alias || !Number.isFinite(amount) || amount <= 0) return null;
  return {
    alias,
    amount,
    display: `${alias} ${amount.toFixed(2)}`,
  };
}

function haystackOf(parts: Array<string | undefined>): string {
  return parts
    .map((p) => String(p || "").toLowerCase())
    .filter(Boolean)
    .join(" ");
}

/** True when caption alias refers to this bank line (description / account / rule). */
export function captionMerchantMatches(
  alias: string,
  parts: {
    description?: string;
    accountName?: string;
    category?: string;
  },
  terms: Record<string, string[]> = ALIAS_TERMS
): boolean {
  const key = normalizeReceiptAlias(alias);
  if (!key) return false;
  const hay = haystackOf([parts.description, parts.accountName, parts.category]);
  if (!hay.trim()) return false;

  const matchedTerms = terms[key];
  if (matchedTerms) {
    return matchedTerms.some((term) => {
      if (term.length <= 2) {
        const re = new RegExp(`(?:^|[^a-z0-9])${term}(?:[^a-z0-9]|$)`, "i");
        return re.test(hay);
      }
      return hay.includes(term);
    });
  }

  if (key.length < 3) return false;
  if (hay.includes(key)) return true;
  // "DEANO'S MOBILE MECHANIC" still contains alias deanos / deanomobilemechanic.
  const hayLetters = normalizeReceiptAlias(hay);
  if (key.length >= 5 && hayLetters.includes(key)) return true;
  if (key.length >= 12 && lettersContainWithGaps(hayLetters, key, 1)) return true;
  return false;
}

/**
 * Supplier printed on the docket, e.g. "Deanos Mobile Mechanic".
 * Two substantial words in the bank line are enough (statements truncate "MECHANIC" to "MECH").
 */
export function vendorMatchesBankLine(
  vendor: string,
  parts: {
    description?: string;
    accountName?: string;
    category?: string;
  }
): boolean {
  const words = String(vendor || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 5);
  if (words.length === 0) return false;
  const hayLetters = normalizeReceiptAlias(
    haystackOf([parts.description, parts.accountName, parts.category])
  );
  if (!hayLetters) return false;
  const hits = words.filter(
    (word) =>
      hayLetters.includes(word) ||
      (word.length >= 6 && hayLetters.includes(word.slice(0, 5)))
  );
  if (words.length === 1) return hits.length === 1;
  return hits.length >= 2;
}

/** Needle appears in hay with at most `extras` extra letters inserted in hay. */
function lettersContainWithGaps(
  hay: string,
  needle: string,
  extras: number
): boolean {
  if (!hay || !needle || needle.length < 12) return false;
  for (let start = 0; start < hay.length; start++) {
    if (hay[start] !== needle[0]) continue;
    let h = start;
    let n = 0;
    let extra = 0;
    while (h < hay.length && n < needle.length) {
      if (hay[h] === needle[n]) {
        h += 1;
        n += 1;
      } else {
        extra += 1;
        h += 1;
        if (extra > extras) break;
      }
    }
    if (n === needle.length) return true;
  }
  return false;
}

export function captionAmountMatches(
  captionAmount: number,
  entryAmount: number
): boolean {
  return Math.abs(cents(Math.abs(entryAmount)) - cents(captionAmount)) <= 1;
}

export type CaptionMatchEntry = {
  id: string;
  date?: string;
  description?: string;
  amount?: number;
  accountName?: string;
  category?: string;
  receiptIds?: string[];
  source?: string;
};

export type CaptionMatchReceipt = {
  id: string;
  caption?: string;
  captionAlias?: string;
  captionAmount?: number;
  /** Printed supplier, when the caption alias has no spaces. */
  vendor?: string;
  /** Docket date. Bank lines often post the next day. */
  receiptDate?: string;
  ledgerEntryIds?: string[];
};

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/** Card purchases often hit the statement one to three days after the docket. */
const RECEIPT_BANK_DATE_WINDOW_DAYS = 3;

export function parseLooseIsoDate(raw: string | undefined): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (dmy) {
    let year = dmy[3];
    if (year.length === 2) year = Number(year) >= 70 ? `19${year}` : `20${year}`;
    const month = dmy[2].padStart(2, "0");
    const day = dmy[1].padStart(2, "0");
    if (Number(month) < 1 || Number(month) > 12) return null;
    if (Number(day) < 1 || Number(day) > 31) return null;
    return `${year}-${month}-${day}`;
  }
  const named = s.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})/);
  if (!named) return null;
  const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  let year = named[3];
  if (year.length === 2) year = `20${year}`;
  return `${year}-${month}-${named[1].padStart(2, "0")}`;
}

function daysFromReceiptToBank(
  receiptDate: string | undefined,
  bankDate: string | undefined
): number | null {
  const receipt = parseLooseIsoDate(receiptDate);
  const bank = parseLooseIsoDate(bankDate);
  if (!receipt || !bank) return null;
  const ms = Date.parse(`${bank}T00:00:00Z`) - Date.parse(`${receipt}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86400000);
}

function receiptMatchFields(receipt: CaptionMatchReceipt): {
  alias: string;
  amount: number;
} | null {
  if (
    receipt.captionAlias &&
    Number.isFinite(Number(receipt.captionAmount)) &&
    Number(receipt.captionAmount) > 0
  ) {
    return {
      alias: normalizeReceiptAlias(receipt.captionAlias),
      amount: Number(receipt.captionAmount),
    };
  }
  const parsed = parseReceiptCaption(String(receipt.caption || ""));
  if (parsed) return { alias: parsed.alias, amount: parsed.amount };
  const amount = Number(receipt.captionAmount);
  if (
    Number.isFinite(amount) &&
    amount > 0 &&
    String(receipt.vendor || "").trim()
  ) {
    return { alias: "", amount };
  }
  return null;
}

function merchantAgrees(
  receipt: CaptionMatchReceipt,
  alias: string,
  entry: CaptionMatchEntry,
  terms: Record<string, string[]>
): boolean {
  const parts = {
    description: entry.description,
    accountName: entry.accountName,
    category: entry.category,
  };
  if (alias && captionMerchantMatches(alias, parts, terms)) return true;
  return vendorMatchesBankLine(String(receipt.vendor || ""), parts);
}

/**
 * Attach only when one inbox receipt and one bank line uniquely agree
 * on merchant + amount. A docket dated the day before the statement still matches.
 * Two bank lines inside that window stay unmatched.
 */
export function pickUniqueCaptionMatches(
  receipts: CaptionMatchReceipt[],
  entries: CaptionMatchEntry[],
  terms: Record<string, string[]> = ALIAS_TERMS
): Array<{ receiptId: string; entryId: string }> {
  const openReceipts = receipts.filter(
    (r) => !Array.isArray(r.ledgerEntryIds) || r.ledgerEntryIds.length === 0
  );
  const openEntries = entries.filter((e) => {
    const ids = Array.isArray(e.receiptIds) ? e.receiptIds : [];
    return ids.length === 0 && String(e.id || "").trim();
  });

  const pairs: Array<{ receiptId: string; entryId: string }> = [];
  for (const receipt of openReceipts) {
    const fields = receiptMatchFields(receipt);
    if (!fields) continue;
    for (const entry of openEntries) {
      if (!captionAmountMatches(fields.amount, Number(entry.amount) || 0)) {
        continue;
      }
      if (!merchantAgrees(receipt, fields.alias, entry, terms)) continue;
      pairs.push({ receiptId: receipt.id, entryId: entry.id });
    }
  }

  const byReceipt = new Map<string, string[]>();
  const byEntry = new Map<string, string[]>();
  for (const pair of pairs) {
    const r = byReceipt.get(pair.receiptId) || [];
    r.push(pair.entryId);
    byReceipt.set(pair.receiptId, r);
    const e = byEntry.get(pair.entryId) || [];
    e.push(pair.receiptId);
    byEntry.set(pair.entryId, e);
  }

  const chosen: Array<{ receiptId: string; entryId: string }> = [];
  for (const [receiptId, entryIds] of byReceipt) {
    let unique = [...new Set(entryIds)];
    if (unique.length > 1) {
      const receipt = openReceipts.find((r) => r.id === receiptId);
      const close = unique.filter((entryId) => {
        const entry = openEntries.find((e) => e.id === entryId);
        const gap = daysFromReceiptToBank(receipt?.receiptDate, entry?.date);
        return (
          gap != null &&
          gap >= -1 &&
          gap <= RECEIPT_BANK_DATE_WINDOW_DAYS
        );
      });
      if (close.length === 1) unique = close;
    }
    if (unique.length !== 1) continue;
    const entryId = unique[0];
    const receiptIds = [...new Set(byEntry.get(entryId) || [])];
    if (receiptIds.length !== 1) continue;
    chosen.push({ receiptId, entryId });
  }
  return chosen;
}
