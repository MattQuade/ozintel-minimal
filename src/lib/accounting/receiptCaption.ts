/**
 * Receipt inbox captions, e.g. "ww 79.13".
 * Alias is typed in the app; matcher uses it against the bank description.
 */

export type ParsedReceiptCaption = {
  alias: string;
  amount: number;
  display: string;
};

const ALIAS_TERMS: Record<string, string[]> = {
  ww: ["woolworths", "woolies"],
  woolworths: ["woolworths", "woolies"],
  woolies: ["woolworths", "woolies"],
  iga: ["iga"],
  coles: ["coles"],
  aldi: ["aldi"],
  bws: ["bws"],
  danmurphys: ["dan murphy", "dan murphys"],
  bp: ["bp"],
  caltex: ["caltex", "ampol"],
  ampol: ["ampol", "caltex"],
  shell: ["shell"],
  officeworks: ["officeworks"],
  bunnings: ["bunnings"],
  ferndale: ["ferndale"],
  linen: ["linen"],
};

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
  }
): boolean {
  const key = normalizeReceiptAlias(alias);
  if (!key) return false;
  const hay = haystackOf([parts.description, parts.accountName, parts.category]);
  if (!hay.trim()) return false;

  const terms = ALIAS_TERMS[key];
  if (terms) {
    return terms.some((term) => {
      if (term.length <= 2) {
        const re = new RegExp(`(?:^|[^a-z0-9])${term}(?:[^a-z0-9]|$)`, "i");
        return re.test(hay);
      }
      return hay.includes(term);
    });
  }

  if (key.length < 3) return false;
  return hay.includes(key);
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
  ledgerEntryIds?: string[];
};

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
  if (!parsed) return null;
  return { alias: parsed.alias, amount: parsed.amount };
}

/**
 * Attach only when one inbox receipt and one new bank line uniquely agree
 * on merchant + amount. Duplicate Woolworths totals in the same file stay unmatched.
 */
export function pickUniqueCaptionMatches(
  receipts: CaptionMatchReceipt[],
  entries: CaptionMatchEntry[]
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
      if (
        !captionMerchantMatches(fields.alias, {
          description: entry.description,
          accountName: entry.accountName,
          category: entry.category,
        })
      ) {
        continue;
      }
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
    const unique = [...new Set(entryIds)];
    if (unique.length !== 1) continue;
    const entryId = unique[0];
    const receiptIds = [...new Set(byEntry.get(entryId) || [])];
    if (receiptIds.length !== 1) continue;
    chosen.push({ receiptId, entryId });
  }
  return chosen;
}
