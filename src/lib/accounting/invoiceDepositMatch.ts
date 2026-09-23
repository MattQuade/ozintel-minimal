/**
 * Auto-match bank deposits to open invoices only when the bank keyword
 * (Kylie, Steven, …) appears in the CSV text and the amount due matches.
 * Repeated amounts pair oldest invoice to oldest payment.
 * Pure helpers — safe for client and server.
 */

export type InvoiceMatchCandidate = {
  id: string;
  number: string;
  status: string;
  amountDue: number;
  matchKeyword?: string;
  customerName?: string;
  issueDate?: string;
};

export type DepositMatchRow = {
  key: string;
  amount: number;
  description: string;
  date?: string;
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

function invoiceSortKey(inv: InvoiceMatchCandidate): string {
  return `${inv.issueDate || "9999-99-99"}|${inv.number}|${inv.id}`;
}

function depositSortKey(row: DepositMatchRow, index: number): string {
  return `${row.date || "9999-99-99"}|${String(index).padStart(6, "0")}`;
}

function sortInvoicesOldestFirst(
  invoices: InvoiceMatchCandidate[]
): InvoiceMatchCandidate[] {
  return invoices.slice().sort((a, b) =>
    invoiceSortKey(a).localeCompare(invoiceSortKey(b))
  );
}

/** Open invoices eligible for deposit allocation. */
export function isOpenForAllocation(inv: InvoiceMatchCandidate): boolean {
  if (inv.status !== "authorised" && inv.status !== "paid") return false;
  return (Number(inv.amountDue) || 0) > 0.009;
}

function keywordAmountMatches(
  inv: InvoiceMatchCandidate,
  amount: number,
  description: string
): boolean {
  if (!amountsMatch(amount, inv.amountDue)) return false;
  return keywordMatchesDescription(inv.matchKeyword, description);
}

/**
 * Oldest open invoice whose amount due matches and whose keyword is in the
 * bank text. No keyword → no auto-match (invoice number / customer name
 * are not enough).
 */
export function findUniqueDepositInvoiceMatch(
  invoices: InvoiceMatchCandidate[],
  opts: {
    amount: number;
    description: string;
    excludeInvoiceIds?: Iterable<string>;
  }
): InvoiceMatchCandidate | null {
  if (!isDepositAmount(opts.amount)) return null;

  const excluded = new Set(
    Array.from(opts.excludeInvoiceIds || []).map(String)
  );
  const haystack = String(opts.description || "");
  const matches = sortInvoicesOldestFirst(
    invoices.filter((inv) => {
      if (excluded.has(inv.id)) return false;
      if (!isOpenForAllocation(inv)) return false;
      return keywordAmountMatches(inv, opts.amount, haystack);
    })
  );
  return matches[0] || null;
}

/**
 * Pair each deposit to an invoice: keyword + amount, oldest invoice to
 * oldest payment. Each invoice is used at most once.
 */
export function matchDepositsToInvoices(
  invoices: InvoiceMatchCandidate[],
  deposits: DepositMatchRow[]
): Map<string, InvoiceMatchCandidate> {
  const used = new Set<string>();
  const out = new Map<string, InvoiceMatchCandidate>();
  const order = deposits
    .map((row, index) => ({ row, index }))
    .sort((a, b) =>
      depositSortKey(a.row, a.index).localeCompare(
        depositSortKey(b.row, b.index)
      )
    );

  for (const { row } of order) {
    if (!isDepositAmount(row.amount)) continue;
    const match = findUniqueDepositInvoiceMatch(invoices, {
      amount: row.amount,
      description: row.description,
      excludeInvoiceIds: used,
    });
    if (!match) continue;
    used.add(match.id);
    out.set(row.key, match);
  }
  return out;
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
