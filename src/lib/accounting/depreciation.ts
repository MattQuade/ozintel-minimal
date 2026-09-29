/**
 * Book depreciation (Xero-like), for reconciling with an accountant.
 * Not tax advice and not an ATO lodgement engine.
 *
 * Actual Days matches Xero Assets on AU financial-year slices:
 * each FY (1 Jul–30 Jun) uses that FY's day count (365 or 366), and
 * diminishing value updates book value after each FY slice.
 */

import { round2 } from "@/lib/accounting/invoiceMath";

export type BookMethod = "straight_line" | "diminishing_value";
export type AveragingMethod = "actual_days" | "full_month";

export type DepreciationInput = {
  cost: number;
  residualValue?: number;
  costLimit?: number | null;
  method: BookMethod;
  /** Annual rate as a percent, e.g. 20 for 20%. */
  ratePercent: number;
  averaging: AveragingMethod;
  depreciationStart: string;
  disposalDate?: string | null;
  /** Accumulated depreciation already claimed as at depreciationStart. */
  openingAccumulatedDep?: number;
};

export type PeriodCharge = {
  from: string;
  to: string;
  days: number;
  charge: number;
  openingBookValue: number;
  closingBookValue: number;
  openingAccumulatedDep: number;
  closingAccumulatedDep: number;
};

function utcNoon(iso: string): Date {
  const day = String(iso || "").slice(0, 10);
  return new Date(`${day}T12:00:00Z`);
}

export function isoDay(input: string | Date): string {
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}/.test(input)) {
    return input.slice(0, 10);
  }
  const d = input instanceof Date ? input : utcNoon(String(input || ""));
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addIsoDays(iso: string, days: number): string {
  const d = utcNoon(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

export function compareIso(a: string, b: string): number {
  return isoDay(a).localeCompare(isoDay(b));
}

export function daysInclusive(from: string, to: string): number {
  const a = utcNoon(from).getTime();
  const b = utcNoon(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

export function firstOfMonth(iso: string): string {
  const d = isoDay(iso);
  return d ? `${d.slice(0, 7)}-01` : "";
}

export function lastOfPreviousMonth(iso: string): string {
  const first = firstOfMonth(iso);
  return first ? addIsoDays(first, -1) : "";
}

/** AU FY ending 30 June that contains `iso`. */
export function auFyEnd(iso: string): string {
  const d = utcNoon(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const endYear = m >= 7 ? y + 1 : y;
  return `${endYear}-06-30`;
}

export function auFyStart(iso: string): string {
  const end = auFyEnd(iso);
  const endYear = Number(end.slice(0, 4));
  return `${endYear - 1}-07-01`;
}

export function auFyDayCount(isoInFy: string): number {
  return daysInclusive(auFyStart(isoInFy), auFyEnd(isoInFy));
}

export function depreciableCost(input: DepreciationInput): number {
  const cost = Math.max(0, Number(input.cost) || 0);
  const limit = Number(input.costLimit);
  if (Number.isFinite(limit) && limit > 0) return Math.min(cost, limit);
  return cost;
}

export function residualOf(input: DepreciationInput): number {
  return Math.max(0, Number(input.residualValue) || 0);
}

export function openingBookValue(input: DepreciationInput): number {
  const residual = residualOf(input);
  const openingAccum = Math.max(0, Number(input.openingAccumulatedDep) || 0);
  const start = depreciableCost(input) - openingAccum;
  return Math.max(residual, start);
}

export function heldInterval(
  input: DepreciationInput,
  periodFrom: string,
  periodTo: string
): { from: string; to: string } | null {
  const from = isoDay(periodFrom);
  const to = isoDay(periodTo);
  const startRaw = isoDay(input.depreciationStart);
  if (!from || !to || !startRaw || compareIso(from, to) > 0) return null;

  const averaging = input.averaging || "actual_days";
  let heldFrom =
    averaging === "full_month" ? firstOfMonth(startRaw) || startRaw : startRaw;
  if (compareIso(heldFrom, from) < 0) heldFrom = from;

  let heldTo = to;
  const disposed = isoDay(input.disposalDate || "");
  if (disposed) {
    if (averaging === "full_month") {
      const cutoff = lastOfPreviousMonth(disposed);
      if (!cutoff || compareIso(cutoff, heldFrom) < 0) return null;
      if (compareIso(cutoff, heldTo) < 0) heldTo = cutoff;
    } else if (compareIso(disposed, heldTo) < 0) {
      heldTo = disposed;
    }
    if (compareIso(disposed, heldFrom) < 0) return null;
  }

  if (compareIso(heldFrom, heldTo) > 0) return null;
  return { from: heldFrom, to: heldTo };
}

type FySlice = { from: string; to: string; fyDays: number; days: number };

function fySlices(from: string, to: string): FySlice[] {
  const slices: FySlice[] = [];
  let cur = from;
  while (compareIso(cur, to) <= 0) {
    const fyTo = auFyEnd(cur);
    const chunkTo = compareIso(fyTo, to) < 0 ? fyTo : to;
    const fyDays = auFyDayCount(cur);
    const days = daysInclusive(cur, chunkTo);
    if (days > 0 && fyDays > 0) {
      slices.push({ from: cur, to: chunkTo, fyDays, days });
    }
    cur = addIsoDays(chunkTo, 1);
  }
  return slices;
}

function annualStraightLine(input: DepreciationInput): number {
  const base = Math.max(0, depreciableCost(input) - residualOf(input));
  return base * (Number(input.ratePercent) || 0) / 100;
}

/**
 * Roll book value from `from` through `to` (inclusive).
 * `startBookValue` is the WDV at the beginning of `from` (before that day's charge).
 */
export function rollBookValue(
  input: DepreciationInput,
  from: string,
  to: string,
  startBookValue: number
): { bookValue: number; charge: number; days: number } {
  const interval = heldInterval(input, from, to);
  if (!interval) {
    return { bookValue: Math.max(residualOf(input), startBookValue), charge: 0, days: 0 };
  }
  const residual = residualOf(input);
  let bv = Math.max(residual, Number(startBookValue) || 0);
  let charge = 0;
  let days = 0;
  const method = input.method;
  const rate = (Number(input.ratePercent) || 0) / 100;
  const slAnnual = annualStraightLine(input);

  for (const slice of fySlices(interval.from, interval.to)) {
    days += slice.days;
    const room = Math.max(0, bv - residual);
    if (room < 0.0000001) continue;
    let sliceCharge = 0;
    if (method === "straight_line") {
      sliceCharge = slAnnual * (slice.days / slice.fyDays);
    } else {
      sliceCharge = bv * rate * (slice.days / slice.fyDays);
    }
    sliceCharge = Math.min(room, Math.max(0, sliceCharge));
    bv -= sliceCharge;
    charge += sliceCharge;
  }
  return { bookValue: bv, charge, days };
}

export function chargeForPeriod(
  input: DepreciationInput,
  periodFrom: string,
  periodTo: string,
  bookValueAtPeriodStart?: number
): PeriodCharge {
  const from = isoDay(periodFrom);
  const to = isoDay(periodTo);
  const residual = residualOf(input);
  const depStart = isoDay(input.depreciationStart);
  const startBv =
    bookValueAtPeriodStart == null
      ? openingBookValue(input)
      : Math.max(residual, Number(bookValueAtPeriodStart) || 0);

  let opening = startBv;
  if (bookValueAtPeriodStart == null && depStart && compareIso(depStart, from) < 0) {
    const priorTo = addIsoDays(from, -1);
    const prior = rollBookValue(input, depStart, priorTo, openingBookValue(input));
    opening = prior.bookValue;
  }

  const rolled = rollBookValue(input, from, to, opening);
  const charge = round2(rolled.charge);
  const closing = round2(Math.max(residual, opening - charge));
  const cost = depreciableCost(input);
  const openingAccum = round2(Math.max(0, cost - opening));
  const closingAccum = round2(Math.max(0, cost - closing));
  return {
    from,
    to,
    days: rolled.days,
    charge,
    openingBookValue: round2(opening),
    closingBookValue: closing,
    openingAccumulatedDep: openingAccum,
    closingAccumulatedDep: closingAccum,
  };
}

export function positionAt(
  input: DepreciationInput,
  asAt: string,
  bookValueOverride?: number,
  overrideAsAt?: string
): { bookValue: number; accumulatedDep: number } {
  const residual = residualOf(input);
  const cost = depreciableCost(input);
  const day = isoDay(asAt);
  const start = isoDay(input.depreciationStart);
  if (!day || !start || compareIso(day, start) < 0) {
    const bv = round2(openingBookValue(input));
    return { bookValue: bv, accumulatedDep: round2(Math.max(0, cost - bv)) };
  }

  const disposed = isoDay(input.disposalDate || "");
  const until =
    disposed && compareIso(disposed, day) < 0 ? disposed : day;

  let origin = start;
  let bv = openingBookValue(input);
  const snapDay = isoDay(overrideAsAt || "");
  if (
    bookValueOverride != null &&
    snapDay &&
    compareIso(snapDay, start) >= 0
  ) {
    if (compareIso(snapDay, until) >= 0) {
      const snapped = round2(Math.max(residual, bookValueOverride));
      return {
        bookValue: snapped,
        accumulatedDep: round2(Math.max(0, cost - snapped)),
      };
    }
    origin = addIsoDays(snapDay, 1);
    bv = Math.max(residual, Number(bookValueOverride) || 0);
  }

  const rolled = rollBookValue(input, origin, until, bv);
  const bookValue = round2(Math.max(residual, rolled.bookValue));
  return {
    bookValue,
    accumulatedDep: round2(Math.max(0, cost - bookValue)),
  };
}

export function parseBookMethod(raw: unknown): BookMethod {
  const s = String(raw || "").toLowerCase();
  if (s.includes("straight")) return "straight_line";
  return "diminishing_value";
}

export function parseAveragingMethod(raw: unknown): AveragingMethod {
  const s = String(raw || "").toLowerCase();
  if (s.includes("full") && s.includes("month")) return "full_month";
  return "actual_days";
}

export function methodLabel(method: BookMethod): string {
  return method === "straight_line" ? "Straight line" : "Diminishing value";
}

export function averagingLabel(averaging: AveragingMethod): string {
  return averaging === "full_month" ? "Full month" : "Actual days";
}
