/**
 * Match bank deposits to open invoices by a unique join — never a guess.
 * Amount due must match, plus one unique signal: invoice number, keyword, or customer.
 * Pure helpers — safe for client and server.
 */

export type InvoiceMatchCandidate = {
  id: string;
  number: string;
  status: string;
  amountDue: number;
  matchKeyword?: string;
  customerName?: string;
};

const AMOUNT_TOLERANCE = 0.01;

const CUSTOMER_STOP = new Set([
  "hotel",
  "the",
  "pty",
  "ltd",
  "limited",
  "and",
  "of",
  "nsw",
  "australia",
]);

export function isDepositAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}

export function amountsMatch(
  bankAmount: number,
  amountDue: number,
  tolerance = AMOUNT_TOLERANCE
): boolean {
  return Math.abs(Math.abs(bankAmount) - Math.abs(amountDue)) <= tolerance;
}

export function keywordMatchesDescription(
  keyword: string | undefined,
  description: string
): boolean {
  const kw = String(keyword || "")
    .trim()
    .toLowerCase();
  if (!kw) return false;
  return String(description || "")
    .toLowerCase()
    .includes(kw);
}

function displayNumber(number: string): string {
  return String(number || "")
    .trim()
    .replace(/^inv-/i, "");
}

function compactAlnum(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeWords(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Invoice number in the bank text — full number, or compact form if long enough. */
export function invoiceNumberInDescription(
  number: string | undefined,
  description: string
): boolean {
  const display = displayNumber(String(number || "")).toLowerCase();
  if (!display) return false;
  const hay = String(description || "").toLowerCase();
  if (display.length >= 5 && hay.includes(display)) return true;
  const compactNum = compactAlnum(display);
  const compactHay = compactAlnum(hay);
  return compactNum.length >= 6 && compactHay.includes(compactNum);
}

/** Customer name in the bank text — full name, or every distinctive word. */
export function customerNameInDescription(
  customerName: string | undefined,
  description: string
): boolean {
  const name = normalizeWords(String(customerName || ""));
  const hay = normalizeWords(description);
  if (!name || !hay) return false;
  if (name.length >= 5 && hay.includes(name)) return true;
  const words = [
    ...new Set(
      name
        .split(" ")
        .filter((w) => w.length > 2 && !CUSTOMER_STOP.has(w))
    ),
  ];
  if (!words.length) return false;
  return words.every((w) => hay.includes(w));
}

/** Open invoices eligible for deposit allocation. */
export function isOpenForAllocation(inv: InvoiceMatchCandidate): boolean {
  if (inv.status !== "authorised" && inv.status !== "paid") return false;
  return (Number(inv.amountDue) || 0) > 0.009;
}

function uniqueOrAmbiguous<T>(matches: T[]): T | null | undefined {
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return null;
  return undefined;
}

/**
 * Unique open invoice whose amountDue ≈ deposit and whose number, keyword,
 * or customer name appears in the bank description.
 * Returns null if none or ambiguous (multiple matches at the strongest tier).
 */
export function findUniqueDepositInvoiceMatch(
  invoices: InvoiceMatchCandidate[],
  opts: {
    amount: number;
    description: string;
    /** Invoice ids already claimed in this import batch */
    excludeInvoiceIds?: Iterable<string>;
  }
): InvoiceMatchCandidate | null {
  if (!isDepositAmount(opts.amount)) return null;

  const excluded = new Set(
    Array.from(opts.excludeInvoiceIds || []).map(String)
  );
  const haystack = String(opts.description || "");

  const open = invoices.filter((inv) => {
    if (excluded.has(inv.id)) return false;
    if (!isOpenForAllocation(inv)) return false;
    return amountsMatch(opts.amount, inv.amountDue);
  });
  if (!open.length) return null;

  const byNumber = uniqueOrAmbiguous(
    open.filter((inv) => invoiceNumberInDescription(inv.number, haystack))
  );
  if (byNumber !== undefined) return byNumber;

  const byKeyword = uniqueOrAmbiguous(
    open.filter((inv) =>
      keywordMatchesDescription(inv.matchKeyword, haystack)
    )
  );
  if (byKeyword !== undefined) return byKeyword;

  const byCustomer = uniqueOrAmbiguous(
    open.filter((inv) =>
      customerNameInDescription(inv.customerName, haystack)
    )
  );
  if (byCustomer !== undefined) return byCustomer;

  return null;
}

/** Open invoices for a manual allocate dropdown (optionally filtered by amount). */
export function openInvoicesForManualAllocate(
  invoices: InvoiceMatchCandidate[],
  opts?: { preferAmount?: number }
): InvoiceMatchCandidate[] {
  const open = invoices
    .filter(isOpenForAllocation)
    .slice()
    .sort((a, b) => String(a.number).localeCompare(String(b.number)));

  const prefer = opts?.preferAmount;
  if (prefer == null || !isDepositAmount(prefer)) return open;

  return open.slice().sort((a, b) => {
    const aExact = amountsMatch(prefer, a.amountDue) ? 0 : 1;
    const bExact = amountsMatch(prefer, b.amountDue) ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return String(a.number).localeCompare(String(b.number));
  });
}
