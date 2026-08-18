import type { CoaAccount, LedgerEntry, BankAccount } from "@/lib/accounting/store";
import {
  formatAuDate,
  formatAuDateRange,
  parseFlexibleDate,
  toIsoDateInput,
} from "@/lib/accounting/dates";
import {
  GST_METHOD,
  accountCodeOf,
  gstAbsOnLine,
  resolveTaxCode,
  signedGst,
  signedInclusive,
  type BasBoxId,
  type BasSourceLine,
  type GstTaxCode,
  type PayRunForBas,
} from "@/lib/accounting/gstTax";

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

export type BasBox = {
  id: BasBoxId;
  label: string;
  amount: number;
  lineCount: number;
  lines: BasSourceLine[];
};

export type BasReport = {
  gstMethod: typeof GST_METHOD;
  period: { from: string; to: string; label: string };
  boxes: BasBox[];
  gstCollected: number;
  gstPaid: number;
  netGst: number;
  g1TotalSales: number;
  g2ExportSales: number;
  g3GstFreeSales: number;
  g4InputTaxedSales: number;
  g5: number;
  g6: number;
  g7Adjustments: number;
  g8: number;
  g9GstOnSales: number;
  g10CapitalPurchases: number;
  g11NonCapitalPurchases: number;
  wagesTotal: number;
  paygWithheld: number;
  taxableSalesCount: number;
  taxablePurchaseCount: number;
  entryCount: number;
  payRunCount: number;
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
  if (n.startsWith("purchases -") || n.includes("opening stock") || n.includes("closing stock")) {
    return true;
  }
  // Xero direct-cost / stock ranges from London Aussie COA
  if (/^11\d{2}$/.test(code) || /^12\d{2}$/.test(code)) return true;
  return code === "5000" || code === "0100";
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

function pushLine(
  buckets: Map<BasBoxId, BasSourceLine[]>,
  id: BasBoxId,
  line: BasSourceLine
) {
  const list = buckets.get(id) || [];
  list.push(line);
  buckets.set(id, list);
}

function box(
  id: BasBoxId,
  label: string,
  amount: number,
  buckets: Map<BasBoxId, BasSourceLine[]>
): BasBox {
  const lines = buckets.get(id) || [];
  return {
    id,
    label,
    amount: round2(amount),
    lineCount: lines.length,
    lines,
  };
}

function payRunsInPeriod(payRuns: PayRunForBas[], from: string, to: string) {
  return payRuns.filter((run) => {
    if (run.status !== "posted" && run.status !== "stp_submitted") return false;
    const day = toIsoDateInput(run.paymentDate || "");
    return Boolean(day) && day >= from && day <= to;
  });
}

/**
 * Accrual Activity Statement.
 * Sales tax point = invoice / ledger date. Purchases = ledger date.
 * W1/W2 from posted pay runs (payment date). Super is not W1.
 */
export function buildBasSummary(
  entries: LedgerEntry[],
  coa: CoaAccount[],
  from: string,
  to: string,
  payRuns: PayRunForBas[] = []
): BasReport {
  const coaByCode = new Map(coa.map((a) => [a.code, a]));
  const fy = getAuFyBounds(new Date(from + "T12:00:00"));
  const buckets = new Map<BasBoxId, BasSourceLine[]>();

  let g1 = 0;
  let g2 = 0;
  let g3 = 0;
  let g4 = 0;
  let g10 = 0;
  let g11 = 0;
  let gstCollected = 0;
  let gstPaid = 0;
  let taxableSalesCount = 0;
  let taxablePurchaseCount = 0;
  let entryCount = 0;

  for (const entry of entries) {
    const d = parseFlexibleDate(String(entry.date || ""));
    if (!inRange(d, from, to)) continue;
    entryCount += 1;

    const type = String(entry.type || "");
    const taxCode: GstTaxCode = resolveTaxCode(entry, coaByCode);
    if (taxCode === "N-T") continue;
    if (type !== "Revenue" && type !== "Expense" && taxCode !== "CAP") continue;

    const gstAbs = gstAbsOnLine(entry, taxCode);
    const incl = signedInclusive(entry, taxCode, gstAbs);
    if (Math.abs(incl) < 0.005 && gstAbs < 0.005) continue;

    const gstSigned = signedGst(entry, taxCode, gstAbs, incl);
    const sourceLine: BasSourceLine = {
      id: String(entry.id || ""),
      date: String(entry.date || ""),
      description: String(entry.description || ""),
      accountCode: accountCodeOf(entry) || resolveAccountCode(entry),
      accountName: resolveAccountName(entry, coaByCode),
      taxCode,
      amount: round2(incl),
      gstAmount: round2(gstSigned),
      source: String(entry.source || ""),
    };

    if (type === "Revenue") {
      g1 += incl;
      pushLine(buckets, "G1", sourceLine);
      if (taxCode === "EXP") {
        g2 += incl;
        pushLine(buckets, "G2", sourceLine);
      } else if (taxCode === "FRE") {
        g3 += incl;
        pushLine(buckets, "G3", sourceLine);
      } else if (taxCode === "INP") {
        g4 += incl;
        pushLine(buckets, "G4", sourceLine);
      } else if (taxCode === "GST" || taxCode === "CAP") {
        gstCollected += gstSigned;
        pushLine(buckets, "1A", sourceLine);
        if (incl > 0.009) taxableSalesCount += 1;
      }
      continue;
    }

    // Purchases (expense or capital asset)
    if (taxCode === "CAP") {
      g10 += incl;
      gstPaid += gstSigned;
      pushLine(buckets, "G10", sourceLine);
      pushLine(buckets, "1B", sourceLine);
      if (incl > 0.009) taxablePurchaseCount += 1;
    } else if (taxCode === "GST") {
      g11 += incl;
      gstPaid += gstSigned;
      pushLine(buckets, "G11", sourceLine);
      pushLine(buckets, "1B", sourceLine);
      if (incl > 0.009) taxablePurchaseCount += 1;
    }
  }

  const inPeriod = payRunsInPeriod(payRuns, from, to);
  const wagesTotal = round2(
    inPeriod.reduce((s, r) => s + (Number(r.totals?.gross) || 0), 0)
  );
  const paygWithheld = round2(
    inPeriod.reduce((s, r) => s + (Number(r.totals?.paygWithheld) || 0), 0)
  );

  for (const run of inPeriod) {
    const payLine: BasSourceLine = {
      id: `payrun:${run.number || run.paymentDate}`,
      date: run.paymentDate,
      description: `Pay run ${run.number || ""} ${run.periodStart || ""}–${run.periodEnd || ""}`.trim(),
      accountCode: "W1",
      accountName: "Posted pay run",
      taxCode: "N-T",
      amount: round2(Number(run.totals?.gross) || 0),
      gstAmount: 0,
      source: "payroll",
    };
    pushLine(buckets, "W1", { ...payLine });
    pushLine(buckets, "W2", {
      ...payLine,
      accountCode: "W2",
      amount: round2(Number(run.totals?.paygWithheld) || 0),
    });
  }

  const g5 = round2(g2 + g3 + g4);
  const g6 = round2(g1 - g5);
  const g7 = 0;
  const g8 = round2(g6 + g7);
  const g9 = round2(g8 / 11);
  const netGst = round2(gstCollected - gstPaid);

  const periodLabel =
    from === fy.from && to === fy.to
      ? `FY ${fy.label}`
      : formatAuDateRange(from, to);

  const boxes: BasBox[] = [
    box("G1", "G1 Total sales (incl GST)", g1, buckets),
    box("G2", "G2 Export sales", g2, buckets),
    box("G3", "G3 Other GST-free sales", g3, buckets),
    box("G4", "G4 Input taxed sales", g4, buckets),
    box("G5", "G5 G2 + G3 + G4", g5, buckets),
    box("G6", "G6 Sales subject to GST (G1 − G5)", g6, buckets),
    box("G7", "G7 Adjustments", g7, buckets),
    box("G8", "G8 Sales subject to GST after adjustments", g8, buckets),
    box("G9", "G9 GST on sales (G8 ÷ 11)", g9, buckets),
    box("1A", "1A GST on sales", gstCollected, buckets),
    box("G10", "G10 Capital purchases (incl GST)", g10, buckets),
    box("G11", "G11 Non-capital purchases (incl GST)", g11, buckets),
    box("1B", "1B GST on purchases", gstPaid, buckets),
    box("W1", "W1 Total salary, wages and other payments", wagesTotal, buckets),
    box("W2", "W2 Amount withheld from payments shown at W1", paygWithheld, buckets),
  ];

  return {
    gstMethod: GST_METHOD,
    period: { from, to, label: periodLabel },
    boxes,
    gstCollected: round2(gstCollected),
    gstPaid: round2(gstPaid),
    netGst,
    g1TotalSales: round2(g1),
    g2ExportSales: round2(g2),
    g3GstFreeSales: round2(g3),
    g4InputTaxedSales: round2(g4),
    g5,
    g6,
    g7Adjustments: g7,
    g8,
    g9GstOnSales: g9,
    g10CapitalPurchases: round2(g10),
    g11NonCapitalPurchases: round2(g11),
    wagesTotal,
    paygWithheld,
    taxableSalesCount,
    taxablePurchaseCount,
    entryCount,
    payRunCount: inPeriod.length,
    note:
      "Accrual GST: sales on invoice date, purchases on ledger date. W1/W2 from posted pay runs (payment date), excluding super. Pub sales are GST-taxable — G2/G3 should be $0. G7 adjustments are not entered yet. 1A uses tax on each line; G9 is G8÷11 and may differ by rounding.",
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

/**
 * BAS quarter picker options: previous FY + current FY (8 quarters).
 * Ids are unique across years, e.g. fy2025-q1.
 */
export function listBasQuarterOptions(ref: Date = new Date()): Array<{
  id: string;
  label: string;
  from: string;
  to: string;
}> {
  const fy = getAuFyBounds(ref);
  const years = [fy.startYear - 1, fy.startYear];
  return years.flatMap((startYear) => {
    const fyLabel = `${startYear}/${String(startYear + 1).slice(2)}`;
    return getAuBasQuarters(startYear).map((q) => ({
      id: `fy${startYear}-${q.id}`,
      label: `${q.label} · FY${fyLabel}`,
      from: q.from,
      to: q.to,
    }));
  });
}

/** Current BAS quarter id for `listBasQuarterOptions`, falling back to latest past quarter. */
export function currentBasQuarterId(ref: Date = new Date()): string {
  const day = toIsoDateInput(ref);
  const options = listBasQuarterOptions(ref);
  const current = options.find((q) => day >= q.from && day <= q.to);
  if (current) return current.id;
  const past = [...options].reverse().find((q) => day > q.to);
  return past?.id || options[0]?.id || "";
}
