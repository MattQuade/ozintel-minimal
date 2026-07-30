import type { CoaAccount, LedgerEntry, BankAccount } from "@/lib/accounting/store";
import {
  formatAuDate,
  formatAuDateRange,
  parseFlexibleDate,
  toIsoDateInput,
} from "@/lib/accounting/dates";

export type ReportLine = {
  code: string;
  name: string;
  amount: number;
};

export type ProfitLossReport = {
  period: { from: string; to: string; label: string };
  revenue: { lines: ReportLine[]; total: number };
  cogs: { lines: ReportLine[]; total: number };
  grossProfit: number;
  expenses: { lines: ReportLine[]; total: number };
  netProfit: number;
  entryCount: number;
};

export type BalanceSheetReport = {
  asAt: string;
  periodLabel: string;
  assets: { lines: ReportLine[]; total: number };
  liabilities: { lines: ReportLine[]; total: number };
  equity: { lines: ReportLine[]; total: number };
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
  difference: number;
  entryCount: number;
};

export type BasReport = {
  period: { from: string; to: string; label: string };
  gstCollected: number;
  gstPaid: number;
  netGst: number;
  g1TotalSales: number;
  g10CapitalPurchases: number;
  g11NonCapitalPurchases: number;
  taxableSalesCount: number;
  taxablePurchaseCount: number;
  entryCount: number;
  note: string;
};

/** Australian FY: 1 Jul – 30 Jun */
export function getAuFyBounds(ref: Date = new Date()): {
  from: string;
  to: string;
  label: string;
  startYear: number;
} {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const startYear = m >= 6 ? y : y - 1;
  return {
    from: `${startYear}-07-01`,
    to: `${startYear + 1}-06-30`,
    label: `${startYear}/${String(startYear + 1).slice(2)}`,
    startYear,
  };
}

/** @deprecated Prefer parseFlexibleDate from dates.ts */
export function parseEntryDate(dateStr: string): Date | null {
  return parseFlexibleDate(dateStr);
}

function toIsoDay(d: Date): string {
  return toIsoDateInput(d);
}

function inRange(entryDate: Date | null, from: string, to: string): boolean {
  if (!entryDate) return false;
  const day = toIsoDay(entryDate);
  return day >= from && day <= to;
}

function onOrBefore(entryDate: Date | null, asAt: string): boolean {
  if (!entryDate) return false;
  return toIsoDay(entryDate) <= asAt;
}

export function resolveAccountCode(entry: LedgerEntry): string {
  if (entry.accountCode) return String(entry.accountCode);
  if (entry.account) {
    const m = String(entry.account).match(/^(\d{3,5})\b/);
    if (m) return m[1];
  }
  return "";
}

export function resolveAccountName(entry: LedgerEntry, coaByCode?: Map<string, CoaAccount>): string {
  if (entry.accountName) return String(entry.accountName);
  const code = resolveAccountCode(entry);
  if (code && coaByCode?.get(code)?.name) return coaByCode.get(code)!.name;
  if (entry.account) {
    const stripped = String(entry.account).replace(/^\d{3,5}\s*[—–\-:]?\s*/, "").trim();
    if (stripped) return stripped;
    return String(entry.account);
  }
  if (entry.category && entry.category !== "Manual") return String(entry.category);
  return "Uncategorized";
}

function isCogs(code: string, name: string): boolean {
  const n = name.toLowerCase();
  if (n.includes("cost of goods") || n === "cogs" || n.includes("cogs ")) return true;
  // Only the dedicated COGS code — other 5xxx accounts in this COA are opex
  return code === "5000";
}

function bump(
  map: Map<string, ReportLine>,
  code: string,
  name: string,
  amount: number
) {
  const key = code || name;
  const existing = map.get(key);
  if (existing) {
    existing.amount += amount;
  } else {
    map.set(key, { code, name, amount });
  }
}

function linesFromMap(map: Map<string, ReportLine>): ReportLine[] {
  return [...map.values()]
    .map((l) => ({ ...l, amount: round2(l.amount) }))
    .filter((l) => Math.abs(l.amount) >= 0.005)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumLines(lines: ReportLine[]): number {
  return round2(lines.reduce((s, l) => s + l.amount, 0));
}

export function buildProfitLoss(
  entries: LedgerEntry[],
  coa: CoaAccount[],
  from: string,
  to: string
): ProfitLossReport {
  const coaByCode = new Map(coa.map((a) => [a.code, a]));
  const fy = getAuFyBounds(new Date(from + "T12:00:00"));
  const revenueMap = new Map<string, ReportLine>();
  const cogsMap = new Map<string, ReportLine>();
  const expenseMap = new Map<string, ReportLine>();
  let entryCount = 0;

  for (const entry of entries) {
    const d = parseFlexibleDate(String(entry.date || ""));
    if (!inRange(d, from, to)) continue;
    const type = String(entry.type || "");
    if (type !== "Revenue" && type !== "Expense") continue;

    entryCount += 1;
    const amount = Math.abs(Number(entry.amount) || 0);
    if (amount < 0.005) continue;

    const code = resolveAccountCode(entry);
    const name = resolveAccountName(entry, coaByCode);

    if (type === "Revenue") {
      bump(revenueMap, code, name, amount);
    } else if (isCogs(code, name)) {
      bump(cogsMap, code, name, amount);
    } else {
      bump(expenseMap, code, name, amount);
    }
  }

  const revenue = { lines: linesFromMap(revenueMap), total: 0 };
  revenue.total = sumLines(revenue.lines);
  const cogs = { lines: linesFromMap(cogsMap), total: 0 };
  cogs.total = sumLines(cogs.lines);
  const expenses = { lines: linesFromMap(expenseMap), total: 0 };
  expenses.total = sumLines(expenses.lines);
  const grossProfit = round2(revenue.total - cogs.total);
  const netProfit = round2(grossProfit - expenses.total);

  return {
    period: {
      from,
      to,
      label:
        from === fy.from && to === fy.to
          ? `FY ${fy.label}`
          : formatAuDateRange(from, to),
    },
    revenue,
    cogs,
    grossProfit,
    expenses,
    netProfit,
    entryCount,
  };
}

/**
 * Cash-book balance sheet:
 * - Bank openings (when asAt >= openingAsAt) seed cash or credit-card liability
 * - Bank cash = openings + signed sum by bankAccountName
 * - Asset / Liability / Equity typed rows accumulate by account
 * - Current year earnings = P&L net for AU FY containing asAt (to asAt)
 */
export function buildBalanceSheet(
  entries: LedgerEntry[],
  coa: CoaAccount[],
  asAt: string,
  banks: BankAccount[] = []
): BalanceSheetReport {
  const coaByCode = new Map(coa.map((a) => [a.code, a]));
  const asAtDate = new Date(asAt + "T12:00:00");
  const fy = getAuFyBounds(Number.isNaN(asAtDate.getTime()) ? new Date() : asAtDate);

  const cashMap = new Map<string, ReportLine>();
  const assetMap = new Map<string, ReportLine>();
  const liabilityMap = new Map<string, ReportLine>();
  const equityMap = new Map<string, ReportLine>();
  let entryCount = 0;

  for (const bank of banks) {
    const openAsAt = toIsoDateInput(bank.openingAsAt) || bank.openingAsAt;
    if (openAsAt && openAsAt > asAt) continue;
    const opening = Number(bank.openingBalance) || 0;
    if (Math.abs(opening) < 0.005) continue;

    const isCredit =
      /credit/i.test(bank.type) || /credit card/i.test(bank.name);

    if (isCredit) {
      bump(liabilityMap, "2300", `Opening — ${bank.name}`, opening);
      bump(equityMap, "3000", "Opening Equity / Capital", -opening);
    } else {
      bump(cashMap, "bank", bank.name, opening);
      bump(equityMap, "3000", "Opening Equity / Capital", opening);
    }
  }

  for (const entry of entries) {
    const d = parseFlexibleDate(String(entry.date || ""));
    if (!onOrBefore(d, asAt)) continue;
    entryCount += 1;

    const signed = Number(entry.amount) || 0;
    const abs = Math.abs(signed);
    const type = String(entry.type || "");
    const bankName = entry.bankAccountName ? String(entry.bankAccountName) : "";

    if (bankName) {
      bump(cashMap, "bank", bankName, signed);
    }

    const code = resolveAccountCode(entry);
    const name = resolveAccountName(entry, coaByCode);

    if (type === "Asset" && !bankName) {
      bump(assetMap, code, name, abs);
    } else if (type === "Liability") {
      const delta = bankName ? -signed : abs;
      bump(liabilityMap, code, name, delta);
    } else if (type === "Equity") {
      const delta = bankName ? -signed : abs;
      bump(equityMap, code, name, delta);
    }
  }

  const pnl = buildProfitLoss(entries, coa, fy.from, asAt < fy.to ? asAt : fy.to);
  if (Math.abs(pnl.netProfit) >= 0.005) {
    bump(equityMap, "3100", "Current Year Earnings", pnl.netProfit);
  }

  const assetLines = [
    ...linesFromMap(cashMap).map((l) => ({
      ...l,
      code: l.code === "bank" ? "1000" : l.code,
      name: l.name.startsWith("Cash") ? l.name : `Cash — ${l.name}`,
    })),
    ...linesFromMap(assetMap),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const liabilityLines = linesFromMap(liabilityMap);
  const equityLines = linesFromMap(equityMap);

  const assetsTotal = sumLines(assetLines);
  const liabilitiesTotal = sumLines(liabilityLines);
  const equityTotal = sumLines(equityLines);
  const totalLE = round2(liabilitiesTotal + equityTotal);
  const difference = round2(assetsTotal - totalLE);

  if (Math.abs(difference) >= 0.005) {
    if (difference > 0) {
      equityLines.push({
        code: "",
        name: "Opening balances / other equity (derived)",
        amount: difference,
      });
    } else {
      assetLines.push({
        code: "",
        name: "Unallocated / opening (derived)",
        amount: Math.abs(difference),
      });
    }
  }

  const assets = { lines: assetLines, total: sumLines(assetLines) };
  const liabilities = { lines: liabilityLines, total: sumLines(liabilityLines) };
  const equity = { lines: equityLines, total: sumLines(equityLines) };
  const totalLiabilitiesAndEquity = round2(liabilities.total + equity.total);

  return {
    asAt,
    periodLabel: `As at ${formatAuDate(asAt)} (FY ${fy.label} earnings)`,
    assets,
    liabilities,
    equity,
    totalLiabilitiesAndEquity,
    balanced: Math.abs(assets.total - totalLiabilitiesAndEquity) < 0.02,
    difference: round2(assets.total - totalLiabilitiesAndEquity),
    entryCount,
  };
}

function isGstFree(
  entry: LedgerEntry,
  coaByCode: Map<string, CoaAccount>
): boolean {
  if (entry.noGST === true) return true;
  if (entry.hasGST === false) return true;
  if (entry.hasGST === true) return false;
  const code = resolveAccountCode(entry);
  const coa = code ? coaByCode.get(code) : undefined;
  if (coa?.noGST) return true;
  const name = resolveAccountName(entry, coaByCode).toLowerCase();
  if (
    name.includes("wage") ||
    name.includes("salary") ||
    name.includes("payg") ||
    name.includes("super")
  ) {
    return true;
  }
  return false;
}

/**
 * Simple BAS-style GST summary (GST-inclusive amounts ÷ 11).
 * G1 = taxable sales (ex GST), G11 = non-capital purchases (ex GST).
 */
export function buildBasSummary(
  entries: LedgerEntry[],
  coa: CoaAccount[],
  from: string,
  to: string
): BasReport {
  const coaByCode = new Map(coa.map((a) => [a.code, a]));
  const fy = getAuFyBounds(new Date(from + "T12:00:00"));
  let gstCollected = 0;
  let gstPaid = 0;
  let g1Inc = 0;
  let g11Inc = 0;
  let taxableSalesCount = 0;
  let taxablePurchaseCount = 0;
  let entryCount = 0;

  for (const entry of entries) {
    const d = parseFlexibleDate(String(entry.date || ""));
    if (!inRange(d, from, to)) continue;
    entryCount += 1;

    const type = String(entry.type || "");
    if (type !== "Revenue" && type !== "Expense") continue;
    if (isGstFree(entry, coaByCode)) continue;

    const abs = Math.abs(Number(entry.amount) || 0);
    if (abs < 0.005) continue;

    if (type === "Revenue") {
      g1Inc += abs;
      gstCollected += abs / 11;
      taxableSalesCount += 1;
    } else {
      g11Inc += abs;
      gstPaid += abs / 11;
      taxablePurchaseCount += 1;
    }
  }

  const netGst = round2(gstCollected - gstPaid);

  return {
    period: {
      from,
      to,
      label:
        from === fy.from && to === fy.to
          ? `FY ${fy.label}`
          : formatAuDateRange(from, to),
    },
    gstCollected: round2(gstCollected),
    gstPaid: round2(gstPaid),
    netGst,
    g1TotalSales: round2(g1Inc - gstCollected),
    g10CapitalPurchases: 0,
    g11NonCapitalPurchases: round2(g11Inc - gstPaid),
    taxableSalesCount,
    taxablePurchaseCount,
    entryCount,
    note: "Assumes GST-inclusive bank amounts. GST-free accounts (COA noGST / wages) are excluded.",
  };
}

/** AU BAS quarters for a financial year start year (e.g. 2025 → FY25/26). */
export function getAuBasQuarters(fyStartYear: number): Array<{
  id: string;
  label: string;
  from: string;
  to: string;
}> {
  return [
    {
      id: "q1",
      label: `Q1 Jul–Sep ${fyStartYear}`,
      from: `${fyStartYear}-07-01`,
      to: `${fyStartYear}-09-30`,
    },
    {
      id: "q2",
      label: `Q2 Oct–Dec ${fyStartYear}`,
      from: `${fyStartYear}-10-01`,
      to: `${fyStartYear}-12-31`,
    },
    {
      id: "q3",
      label: `Q3 Jan–Mar ${fyStartYear + 1}`,
      from: `${fyStartYear + 1}-01-01`,
      to: `${fyStartYear + 1}-03-31`,
    },
    {
      id: "q4",
      label: `Q4 Apr–Jun ${fyStartYear + 1}`,
      from: `${fyStartYear + 1}-04-01`,
      to: `${fyStartYear + 1}-06-30`,
    },
  ];
}
