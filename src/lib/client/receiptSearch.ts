export type ReceiptSearchRow = {
  caption?: string;
  captionAlias?: string;
  captionAmount?: number;
  originalFilename?: string;
  docket?: {
    vendor?: string;
    invoiceReceiptId?: string;
    subtotal?: number | null;
    total?: number | null;
    amountPaid?: number | null;
    lineItems?: Array<{ description?: string; amount?: number | null }>;
  } | null;
};

function parseReceiptSearch(raw: string): { words: string[]; amounts: number[] } {
  const words: string[] = [];
  const amounts: number[] = [];
  for (const token of raw.trim().toLowerCase().split(/\s+/).filter(Boolean)) {
    const numeric = token.replace(/^\$/, "").replace(/,/g, "");
    if (/^\d+(?:\.\d{1,2})?$/.test(numeric)) {
      amounts.push(Number(numeric));
    } else {
      words.push(token);
    }
  }
  return { words, amounts };
}

function receiptSearchText(r: ReceiptSearchRow): string {
  return [
    r.caption,
    r.captionAlias,
    r.originalFilename,
    r.docket?.vendor,
    r.docket?.invoiceReceiptId,
    ...(r.docket?.lineItems || []).map((line) => line.description),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function receiptSearchAmounts(r: ReceiptSearchRow): number[] {
  return [
    r.captionAmount,
    r.docket?.total,
    r.docket?.amountPaid,
    r.docket?.subtotal,
    ...(r.docket?.lineItems || []).map((line) => line.amount),
  ].filter((n): n is number => n != null && Number.isFinite(n));
}

function amountNear(target: number, actual: number): boolean {
  return (
    Math.abs(Math.round(Math.abs(target) * 100) - Math.round(Math.abs(actual) * 100)) <=
    1
  );
}

export function receiptMatchesSearch(r: ReceiptSearchRow, raw: string): boolean {
  const { words, amounts } = parseReceiptSearch(raw);
  if (words.length === 0 && amounts.length === 0) return true;
  const text = receiptSearchText(r);
  if (words.some((word) => !text.includes(word))) return false;
  if (amounts.length === 0) return true;
  const values = receiptSearchAmounts(r);
  return amounts.every(
    (target) =>
      values.some((actual) => amountNear(target, actual)) ||
      new RegExp(
        `(?:^|[^\\d])${target.toFixed(2).replace(".", "\\.")}(?:[^\\d]|$)`
      ).test(text)
  );
}
