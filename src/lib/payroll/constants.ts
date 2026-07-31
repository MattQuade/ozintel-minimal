/**
 * Super Guarantee rate — update when ATO SG rate changes.
 * From 1 July 2025 the SG rate is 12% of ordinary time earnings (OTE).
 * Still current as at FY2026–27 (from 1 July 2026).
 */
export const SUPER_GUARANTEE_RATE = 0.12;

/** Display / form default as percent (12). */
export const SUPER_GUARANTEE_PERCENT = SUPER_GUARANTEE_RATE * 100;

/** COA codes used when posting a pay run to the ledger. */
export const PAYROLL_COA = {
  wagesExpense: "1965",
  superExpense: "1458",
  wagesPayable: "804",
  superPayable: "805",
  paygwPayable: "909",
} as const;
