/**
 * ATO-style PAYG withholding approximation (Schedule 1 formulas).
 *
 * Source: Taxation Administration (Withholding Schedules) Instrument 2026
 * (LI 2026/18), Schedule 1 — coefficients for weekly payments from 1 July 2026
 * (FY2026–27). Fortnightly = convert to weekly equivalent, then × 2.
 *
 * Formula: y = a×x − b where x = whole dollars of weekly earnings + $0.99.
 * Result rounded to nearest dollar. Scales 1–3 and no-TFN (Scale 4) only.
 *
 * Limitations (full STP / Schedule 1 later):
 * - No Medicare levy adjustment shade-in beyond what is baked into coefficients
 * - No tax offsets, HELP/VSL, seniors, working holiday makers, leave loading extras
 * - No STP Phase 2 lodgement — withholding only for payslip / ledger MVP
 */

export type PayFrequency = "weekly" | "fortnightly";
export type PaygResidency = "resident" | "foreign";

export type PaygWithholdingInput = {
  grossEarnings: number;
  frequency: PayFrequency;
  residency: PaygResidency;
  taxFreeThresholdClaimed: boolean;
  /** Empty / missing TFN → Scale 4 flat rates. */
  hasTfn: boolean;
};

type CoeffBand = {
  /** Apply when weekly earnings x is strictly less than this upper bound (or Infinity). */
  lessThan: number;
  a: number;
  b: number;
  /** When true, withhold $0 (below threshold). */
  nil?: boolean;
};

/**
 * Scale 1 — resident, tax-free threshold NOT claimed (LI 2026/18).
 */
const SCALE_1: CoeffBand[] = [
  { lessThan: 188, a: 0.15, b: 0.15 },
  { lessThan: 371, a: 0.2084, b: 11.0185 },
  { lessThan: 515, a: 0.179, b: 0.1066 },
  { lessThan: 932, a: 0.3227, b: 74.1674 },
  { lessThan: 2246, a: 0.32, b: 71.6508 },
  { lessThan: 3303, a: 0.39, b: 228.8816 },
  { lessThan: Infinity, a: 0.47, b: 493.1893 },
];

/**
 * Scale 2 — resident, tax-free threshold claimed (LI 2026/18).
 */
const SCALE_2: CoeffBand[] = [
  { lessThan: 362, a: 0, b: 0, nil: true },
  { lessThan: 538, a: 0.15, b: 54.3462 },
  { lessThan: 673, a: 0.25, b: 108.2135 },
  { lessThan: 721, a: 0.17, b: 54.3473 },
  { lessThan: 865, a: 0.179, b: 60.8377 },
  { lessThan: 1282, a: 0.3227, b: 185.1935 },
  { lessThan: 2596, a: 0.32, b: 181.7319 },
  { lessThan: 3653, a: 0.39, b: 363.4627 },
  { lessThan: Infinity, a: 0.47, b: 655.7704 },
];

/**
 * Scale 3 — foreign residents (LI 2026/18).
 * Note: first band uses a=b=0.30 so y = 0.30×x − 0.30 ≈ 30% of (x−1).
 */
const SCALE_3: CoeffBand[] = [
  { lessThan: 2596, a: 0.3, b: 0.3 },
  { lessThan: 3653, a: 0.37, b: 181.7308 },
  { lessThan: Infinity, a: 0.45, b: 474.0385 },
];

function roundNearestDollar(n: number): number {
  return Math.round(n);
}

function wholeDollarsPlus99(earnings: number): number {
  const whole = Math.floor(Math.max(0, earnings));
  return whole + 0.99;
}

function findBand(bands: CoeffBand[], x: number): CoeffBand {
  for (const band of bands) {
    if (x < band.lessThan) return band;
  }
  return bands[bands.length - 1];
}

function weeklyWithholdingFromBands(weeklyEarnings: number, bands: CoeffBand[]): number {
  if (weeklyEarnings <= 0) return 0;
  const x = wholeDollarsPlus99(weeklyEarnings);
  const band = findBand(bands, x);
  if (band.nil) return 0;
  const y = band.a * x - band.b;
  return Math.max(0, roundNearestDollar(y));
}

/**
 * Calculate PAYG withholding for one pay period.
 * Returns amount in dollars (nearest dollar, ATO-style).
 */
export function calculatePaygWithholding(input: PaygWithholdingInput): number {
  const gross = Math.max(0, Number(input.grossEarnings) || 0);
  if (gross <= 0) return 0;

  const periods = input.frequency === "fortnightly" ? 2 : 1;
  const weeklyEquivalent =
    input.frequency === "fortnightly" ? gross / 2 : gross;

  // Scale 4 — no TFN
  if (!input.hasTfn) {
    const rate = input.residency === "foreign" ? 0.45 : 0.47;
    const base = Math.floor(gross); // ignore cents
    return Math.max(0, roundNearestDollar(base * rate));
  }

  let weeklyTax: number;
  if (input.residency === "foreign") {
    weeklyTax = weeklyWithholdingFromBands(weeklyEquivalent, SCALE_3);
  } else if (input.taxFreeThresholdClaimed) {
    weeklyTax = weeklyWithholdingFromBands(weeklyEquivalent, SCALE_2);
  } else {
    weeklyTax = weeklyWithholdingFromBands(weeklyEquivalent, SCALE_1);
  }

  return weeklyTax * periods;
}

export const PAYG_SCHEDULE_LABEL = "LI 2026/18 Schedule 1 (from 1 July 2026 / FY2026–27)";
