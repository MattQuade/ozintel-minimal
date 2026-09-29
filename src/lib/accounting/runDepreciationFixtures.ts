/**
 * Depreciation engine fixtures — synthetic numbers only.
 * Optional local Xero xlsx check (not committed) via XERO_ASSETS_XLSX
 * or D:\Xero Backup\Assets-*.xlsx.
 *
 * Run: npx tsx src/lib/accounting/runDepreciationFixtures.ts
 */

import { existsSync, readFileSync } from "fs";
import {
  chargeForPeriod,
  daysInclusive,
  openingBookValue,
  type DepreciationInput,
} from "./depreciation";
import { parseXeroAssetsFile } from "./xeroAssetsImport";

type Check = { name: string; ok: boolean; detail: string };

function eq(name: string, actual: number, expected: number, tol = 0.02): Check {
  const ok = Math.abs(actual - expected) <= tol;
  return {
    name,
    ok,
    detail: ok
      ? `${actual}`
      : `expected ${expected}, got ${actual} (tol ${tol})`,
  };
}

function base(partial: Partial<DepreciationInput>): DepreciationInput {
  return {
    cost: 10000,
    residualValue: 0,
    method: "diminishing_value",
    ratePercent: 20,
    averaging: "actual_days",
    depreciationStart: "2024-07-01",
    ...partial,
  };
}

export function runDepreciationFixtures(): Check[] {
  const checks: Check[] = [];

  const fullFyDv = chargeForPeriod(
    base({ method: "diminishing_value", ratePercent: 20 }),
    "2024-07-01",
    "2025-06-30"
  );
  checks.push(eq("DV full FY = cost × rate", fullFyDv.charge, 2000));
  checks.push(eq("DV full FY closing BV", fullFyDv.closingBookValue, 8000));
  checks.push(
    eq("FY 2024-25 has 365 days", daysInclusive("2024-07-01", "2025-06-30"), 365)
  );

  const leapFyDv = chargeForPeriod(
    base({
      method: "diminishing_value",
      ratePercent: 25,
      depreciationStart: "2023-07-01",
    }),
    "2023-07-01",
    "2024-06-30"
  );
  checks.push(eq("DV leap FY still cost × rate", leapFyDv.charge, 2500));
  checks.push(
    eq("FY 2023-24 has 366 days", daysInclusive("2023-07-01", "2024-06-30"), 366)
  );

  const sl = chargeForPeriod(
    base({
      method: "straight_line",
      ratePercent: 10,
      cost: 5000,
      residualValue: 500,
    }),
    "2024-07-01",
    "2025-06-30"
  );
  checks.push(eq("SL full FY = (cost-residual)×rate", sl.charge, 450));
  checks.push(eq("SL closing BV", sl.closingBookValue, 4550));

  const daysHeld = daysInclusive("2024-04-15", "2025-06-30");
  const fyDays = daysInclusive("2024-07-01", "2025-06-30");
  const stub = chargeForPeriod(
    base({
      method: "straight_line",
      ratePercent: 10,
      cost: 3650,
      depreciationStart: "2024-04-15",
    }),
    "2024-04-15",
    "2025-06-30"
  );
  // Two FY slices: FY23/24 15 Apr–30 Jun and FY24/25 full.
  const fy1Days = daysInclusive("2024-04-15", "2024-06-30");
  const fy1Len = daysInclusive("2023-07-01", "2024-06-30");
  const expectedStub = 3650 * 0.1 * (fy1Days / fy1Len + fyDays / fyDays);
  checks.push(
    eq("SL actual-days stub across FYs", stub.charge, Math.round(expectedStub * 100) / 100)
  );
  checks.push(eq("stub days counted", stub.days, daysHeld, 0));

  const actual = chargeForPeriod(
    base({
      averaging: "actual_days",
      depreciationStart: "2024-03-15",
      method: "straight_line",
      ratePercent: 12,
      cost: 12000,
    }),
    "2024-03-01",
    "2024-03-31"
  );
  const fullMonth = chargeForPeriod(
    base({
      averaging: "full_month",
      depreciationStart: "2024-03-15",
      method: "straight_line",
      ratePercent: 12,
      cost: 12000,
    }),
    "2024-03-01",
    "2024-03-31"
  );
  checks.push({
    name: "Full month charges more than mid-month actual days",
    ok: fullMonth.charge > actual.charge + 0.009,
    detail: `full ${fullMonth.charge} vs actual ${actual.charge}`,
  });
  checks.push(
    eq("Actual days in March from 15th", actual.days, daysInclusive("2024-03-15", "2024-03-31"), 0)
  );
  checks.push(eq("Full month uses whole March", fullMonth.days, 31, 0));

  const residual = chargeForPeriod(
    base({
      method: "diminishing_value",
      ratePercent: 100,
      cost: 800,
      residualValue: 50,
    }),
    "2024-07-01",
    "2025-06-30"
  );
  checks.push(eq("DV does not go below residual", residual.closingBookValue, 50));
  checks.push(eq("DV residual stops charge", residual.charge, 750));

  const twoYear = chargeForPeriod(
    base({
      method: "diminishing_value",
      ratePercent: 20,
      cost: 10000,
      depreciationStart: "2023-07-01",
    }),
    "2023-07-01",
    "2025-06-30"
  );
  checks.push(
    eq("DV two FY slices compound", twoYear.closingBookValue, 6400)
  );

  const opening = openingBookValue(
    base({ cost: 5000, openingAccumulatedDep: 2000, residualValue: 0 })
  );
  checks.push(eq("Opening BV = cost − opening accum", opening, 3000));

  const fromOpening = chargeForPeriod(
    base({
      cost: 5000,
      openingAccumulatedDep: 2000,
      method: "diminishing_value",
      ratePercent: 20,
      depreciationStart: "2024-07-01",
    }),
    "2024-07-01",
    "2025-06-30"
  );
  checks.push(eq("DV from converted opening", fromOpening.charge, 600));
  checks.push(eq("DV converted closing", fromOpening.closingBookValue, 2400));

  return checks;
}

function defaultXeroPath(): string {
  return (
    process.env.XERO_ASSETS_XLSX ||
    "D:\\Xero Backup\\Assets-2026-09-29T11_37_00.xlsx"
  );
}

export function runXeroSampleCheck(xlsxPath = defaultXeroPath()): Check[] {
  const checks: Check[] = [];
  if (!existsSync(xlsxPath)) {
    checks.push({
      name: "Xero xlsx present (optional)",
      ok: true,
      detail: `skipped — no file at ${xlsxPath}`,
    });
    return checks;
  }
  const rows = parseXeroAssetsFile(readFileSync(xlsxPath), xlsxPath);
  checks.push(eq("Imported Xero row count", rows.length, 35, 0));
  const registered = rows.filter((r) =>
    /registered/i.test(r.assetStatus)
  );
  const disposed = rows.filter((r) => /dispos/i.test(r.assetStatus));
  checks.push(eq("Registered count", registered.length, 32, 0));
  checks.push(eq("Disposed count", disposed.length, 3, 0));

  const comparable = registered.filter(
    (r) => (r.bookOpeningAccumulatedDep || 0) < 0.005 && r.purchasePrice > 0
  );
  let maxAbs = 0;
  let sumAbs = 0;
  let n = 0;
  let worst = "";
  for (const row of comparable) {
    const asAt = row.depreciationToDate || "2025-06-30";
    const got = chargeForPeriod(
      {
        cost: row.purchasePrice,
        residualValue: row.bookResidualValue,
        costLimit: row.bookCostLimit,
        method: row.bookDepreciationMethod,
        ratePercent: row.bookRate,
        averaging: row.bookAveragingMethod,
        depreciationStart: row.bookDepreciationStartDate || row.purchaseDate,
        openingAccumulatedDep: 0,
      },
      row.bookDepreciationStartDate || row.purchaseDate,
      asAt
    );
    const diff = Math.abs(got.closingBookValue - row.bookValue);
    sumAbs += diff;
    n += 1;
    if (diff > maxAbs) {
      maxAbs = diff;
      worst = `${row.assetNumber} ${row.assetName} xero=${row.bookValue} got=${got.closingBookValue}`;
    }
  }
  const mae = n ? sumAbs / n : 0;
  checks.push({
    name: "Xero BV vs engine (opening-accum 0) max |diff| < $0.05",
    ok: maxAbs <= 0.05,
    detail: n
      ? `n=${n} mae=${mae.toFixed(4)} max=${maxAbs.toFixed(4)} ${worst}`
      : "no comparable rows",
  });
  checks.push({
    name: "Xero sample not wildly off (mae < $1)",
    ok: mae < 1,
    detail: `mae=${mae.toFixed(4)}`,
  });
  return checks;
}

export function fixturesPassed(): boolean {
  return runDepreciationFixtures().every((c) => c.ok);
}

const runningDirect = process.argv[1]
  ? process.argv[1].replace(/\\/g, "/").includes("runDepreciationFixtures")
  : false;

if (runningDirect) {
  const checks = [
    ...runDepreciationFixtures(),
    ...runXeroSampleCheck(),
  ];
  let failed = 0;
  for (const check of checks) {
    if (check.ok) console.log(`ok  ${check.name} (${check.detail})`);
    else {
      failed += 1;
      console.error(`FAIL ${check.name}: ${check.detail}`);
    }
  }
  console.log(
    failed
      ? `${failed} failed`
      : `All ${checks.length} depreciation fixtures passed`
  );
  process.exit(failed ? 1 : 0);
}
