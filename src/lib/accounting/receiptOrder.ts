/**
 * Receipt ledger order is the date read off the receipt, oldest first.
 * The day the photo was snapped is not the order.
 * The same receipt date keeps the order snapped. The clock time is not read.
 * Numbers restart at 1 on each Australian financial-year quarter
 * (1 July, 1 October, 1 January, 1 April).
 * A receipt with no readable date is stored after the dated ones, in snap order.
 */
import { sydneyTodayIso } from "@/lib/cashbookSandbox/sydneyDate";

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export type DatedReceipt = {
  id: string;
  uploadedAt: string;
  ledgerNo?: number;
  docket?: { date?: string } | null;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function expandYear(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (raw.length <= 2) return n >= 70 ? 1900 + n : 2000 + n;
  if (n < 1900 || n > 2100) return null;
  return n;
}

function ymd(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Textract date text → YYYY-MM-DD. Day-first for slash dates (10/11/26). */
export function parseReceiptDay(raw: string | null | undefined): string | null {
  const t = String(raw || "").trim();
  if (!t) return null;

  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));

  m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (m) {
    const year = expandYear(m[3]);
    if (year == null) return null;
    return ymd(year, Number(m[2]), Number(m[1]));
  }

  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{2,4})\b/);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const year = expandYear(m[3]);
    if (!month || year == null) return null;
    return ymd(year, month, Number(m[1]));
  }

  return null;
}

function snapMs(iso: string): number {
  const n = Date.parse(iso || "");
  return Number.isFinite(n) ? n : 0;
}

/** Sydney calendar day of the snap. Null when uploadedAt is not a time. */
export function snapSydneyDay(iso: string | null | undefined): string | null {
  const n = Date.parse(iso || "");
  if (!Number.isFinite(n)) return null;
  const day = sydneyTodayIso(new Date(n));
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * Start of the Australian financial-year quarter containing this day.
 * Quarters open on 1 July, 1 October, 1 January and 1 April.
 */
export function auFyQuarterStart(isoDay: string): string | null {
  const m = String(isoDay || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month >= 7 && month <= 9) return `${year}-07-01`;
  if (month >= 10 && month <= 12) return `${year}-10-01`;
  if (month >= 1 && month <= 3) return `${year}-01-01`;
  if (month >= 4 && month <= 6) return `${year}-04-01`;
  return null;
}

const UNKNOWN_QUARTER = "9999-99-99";

/**
 * Oldest receipt date first. Snap day is not a sort key.
 * The same date, and receipts with no date, keep snap order.
 */
export function compareReceiptChronology(a: DatedReceipt, b: DatedReceipt): number {
  const dayA = parseReceiptDay(a.docket?.date);
  const dayB = parseReceiptDay(b.docket?.date);
  if (dayA && dayB && dayA !== dayB) return dayA < dayB ? -1 : 1;
  if (dayA && !dayB) return -1;
  if (!dayA && dayB) return 1;
  const snap = snapMs(a.uploadedAt) - snapMs(b.uploadedAt);
  if (snap !== 0) return snap;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function quarterOf(receipt: DatedReceipt): string | null {
  const day = parseReceiptDay(receipt.docket?.date);
  if (!day) return null;
  return auFyQuarterStart(day) || UNKNOWN_QUARTER;
}

export function withLedgerNumbers<T extends DatedReceipt>(receipts: T[]): T[] {
  const sorted = [...receipts].sort(compareReceiptChronology);
  let quarter = "";
  let n = 0;
  return sorted.map((receipt) => {
    const next = quarterOf(receipt);
    if (next && next !== quarter) {
      quarter = next;
      n = 0;
    }
    n += 1;
    return { ...receipt, ledgerNo: n };
  });
}

/** Full receipt total. GST is left in, whether or not the docket split it out. */
export function receiptTotalAmount(meta: {
  captionAmount?: number;
  docket?: { total?: number | null; amountPaid?: number | null } | null;
}): number | null {
  const candidates = [
    meta.captionAmount,
    meta.docket?.total,
    meta.docket?.amountPaid,
  ];
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  return null;
}

export function ledgerNumbersCurrent(receipts: DatedReceipt[]): boolean {
  const ordered = withLedgerNumbers(receipts);
  if (ordered.length !== receipts.length) return false;
  for (let i = 0; i < ordered.length; i++) {
    if (receipts[i]?.id !== ordered[i].id) return false;
    if (receipts[i]?.ledgerNo !== ordered[i].ledgerNo) return false;
  }
  return true;
}
