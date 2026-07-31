/**
 * Match bank-import deposits to open invoices by amountDue + matchKeyword.
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

/** Open invoices eligible for deposit allocation. */
export function isOpenForAllocation(inv: InvoiceMatchCandidate): boolean {
  if (inv.status !== "authorised" && inv.status !== "paid") return false;
  return (Number(inv.amountDue) || 0) > 0.009;
}

/**
 * Find a unique open invoice where amountDue ≈ deposit and keyword ⊆ description.
 * Returns null if none or ambiguous (multiple matches).
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

  const matches = invoices.filter((inv) => {
    if (excluded.has(inv.id)) return false;
    if (!isOpenForAllocation(inv)) return false;
    if (!String(inv.matchKeyword || "").trim()) return false;
    if (!amountsMatch(opts.amount, inv.amountDue)) return false;
    return keywordMatchesDescription(inv.matchKeyword, haystack);
  });

  if (matches.length === 1) return matches[0];
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
