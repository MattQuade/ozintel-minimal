import { promises as fs } from "fs";
import {
  getAccountingDataDir,
  getPayRunsFilePath,
} from "@/lib/dataPaths";
import {
  employeeDisplayName,
  getEmployeeById,
  readEmployees,
  type Employee,
} from "@/lib/accounting/employees";
import {
  appendLedgerEntries,
  readCoa,
  type LedgerEntry,
} from "@/lib/accounting/store";
import {
  PAYROLL_COA,
  SUPER_GUARANTEE_RATE,
} from "@/lib/payroll/constants";
import {
  hospitalityEmploymentKind,
  hospitalityOvertimeAmount,
  hospitalityWeekendEarnings,
  hospitalityWeekendMultipliers,
} from "@/lib/payroll/hospitalityAward";
import {
  calculatePaygWithholding,
  type PayFrequency,
} from "@/lib/payroll/paygWithholding";

export type PayRunStatus = "draft" | "posted" | "stp_submitted";

export type PayRunLine = {
  employeeId: string;
  employeeName: string;
  /** Copied from employee at line build — drives Sat/Sun multipliers. */
  employmentStatus: string;
  /** Weekday ordinary hours (Mon–Fri). */
  hours: number;
  ordinaryRate: number;
  /** Weekday ordinary earnings (base rate × weekday hours). */
  ordinaryEarnings: number;
  saturdayHours: number;
  saturdayEarnings: number;
  sundayHours: number;
  sundayEarnings: number;
  overtimeHours: number;
  /** Overtime $ (Hospitality Award: first 2h @ 150%, rest @ 200%). */
  overtime: number;
  allowances: number;
  gross: number;
  /** OTE for SG ≈ weekday + Sat + Sun ordinary-time + allowances (excl. OT). */
  ote: number;
  paygWithheld: number;
  superAmount: number;
  net: number;
};

export type PayLineOverride = Partial<
  Pick<
    PayRunLine,
    | "ordinaryEarnings"
    | "allowances"
    | "overtime"
    | "overtimeHours"
    | "hours"
    | "ordinaryRate"
    | "saturdayHours"
    | "saturdayEarnings"
    | "sundayHours"
    | "sundayEarnings"
  >
>;

export type PayRunTotals = {
  gross: number;
  paygWithheld: number;
  superAmount: number;
  net: number;
  employeeCount: number;
};

export type PayRun = {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  frequency: PayFrequency;
  status: PayRunStatus;
  employeeIds: string[];
  lines: PayRunLine[];
  totals: PayRunTotals;
  ledgerEntryIds: string[];
  journalRef?: string;
  postedAt?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatePayRunInput = {
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  frequency?: PayFrequency;
  employeeIds?: string[];
  /** Optional per-employee overrides keyed by employee id. */
  lineOverrides?: Record<string, PayLineOverride>;
  notes?: string;
};

let payRunsChain: Promise<unknown> = Promise.resolve();
function withPayRunsLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = payRunsChain.then(fn, fn);
  payRunsChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function ensureDir() {
  await fs.mkdir(getAccountingDataDir(), { recursive: true });
}

async function writePayRunsUnlocked(runs: PayRun[]) {
  await ensureDir();
  const target = getPayRunsFilePath();
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(runs, null, 2), "utf8");
  try {
    await fs.rename(tmp, target);
  } catch {
    await fs.copyFile(tmp, target);
    await fs.unlink(tmp).catch(() => undefined);
  }
}

async function readPayRunsUnlocked(): Promise<PayRun[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(getPayRunsFilePath(), "utf8");
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return (parsed as PayRun[]).map((run) => ({
      ...run,
      lines: Array.isArray(run.lines)
        ? run.lines.map((l) => ({
            ...l,
            employmentStatus: String(l.employmentStatus || ""),
            saturdayHours: Number(l.saturdayHours) || 0,
            saturdayEarnings: Number(l.saturdayEarnings) || 0,
            sundayHours: Number(l.sundayHours) || 0,
            sundayEarnings: Number(l.sundayEarnings) || 0,
            overtimeHours: Number(l.overtimeHours) || 0,
            hours: Number(l.hours) || 0,
            ordinaryRate: Number(l.ordinaryRate) || 0,
            ordinaryEarnings: Number(l.ordinaryEarnings) || 0,
            allowances: Number(l.allowances) || 0,
            overtime: Number(l.overtime) || 0,
          }))
        : [],
    }));
  } catch {
    await writePayRunsUnlocked([]);
    return [];
  }
}

export async function readPayRuns(): Promise<PayRun[]> {
  return readPayRunsUnlocked();
}

export async function getPayRunById(id: string): Promise<PayRun | null> {
  const runs = await readPayRunsUnlocked();
  return runs.find((r) => r.id === id) || null;
}

function nextPayRunNumber(existing: PayRun[]): string {
  let max = 0;
  for (const r of existing) {
    const m = String(r.number || "").match(/(\d+)/);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `PAY-${String(max + 1).padStart(4, "0")}`;
}

function weeksInFrequency(frequency: PayFrequency): number {
  return frequency === "fortnightly" ? 2 : 1;
}

/** Default ordinary earnings for one pay period from employee pay template. */
export function defaultOrdinaryEarnings(
  emp: Employee,
  frequency: PayFrequency
): { ordinary: number; hours: number; rate: number } {
  const weeks = weeksInFrequency(frequency);
  const hoursPerWeek = emp.standardHoursPerWeek || 38;
  if (emp.payBasis === "hourly") {
    const hours = round2(hoursPerWeek * weeks);
    const ordinary = round2(emp.ordinaryRate * hours);
    return { ordinary, hours, rate: emp.ordinaryRate };
  }
  // Salary: annual ÷ 52 × weeks
  const ordinary = round2((emp.ordinaryRate / 52) * weeks);
  return {
    ordinary,
    hours: round2(hoursPerWeek * weeks),
    rate: emp.ordinaryRate,
  };
}

export function buildPayRunLine(
  emp: Employee,
  frequency: PayFrequency,
  override?: PayLineOverride
): PayRunLine {
  const defaults = defaultOrdinaryEarnings(emp, frequency);
  const ordinaryRate = round2(
    override?.ordinaryRate != null && Number.isFinite(Number(override.ordinaryRate))
      ? Number(override.ordinaryRate)
      : defaults.rate
  );
  const hours = round2(
    override?.hours != null && Number.isFinite(Number(override.hours))
      ? Number(override.hours)
      : defaults.hours
  );

  let ordinaryEarnings: number;
  if (
    override?.ordinaryEarnings != null &&
    Number.isFinite(Number(override.ordinaryEarnings))
  ) {
    ordinaryEarnings = round2(Number(override.ordinaryEarnings));
  } else if (emp.payBasis === "hourly") {
    ordinaryEarnings = round2(ordinaryRate * hours);
  } else if (
    override?.hours != null &&
    defaults.hours > 0 &&
    Number(override.hours) !== defaults.hours
  ) {
    ordinaryEarnings = round2(defaults.ordinary * (hours / defaults.hours));
  } else {
    ordinaryEarnings = defaults.ordinary;
  }

  const kind = hospitalityEmploymentKind(emp.employmentStatus);
  const weekend = hospitalityWeekendMultipliers(kind);

  const saturdayHours = round2(
    override?.saturdayHours != null &&
      Number.isFinite(Number(override.saturdayHours))
      ? Number(override.saturdayHours)
      : 0
  );
  const sundayHours = round2(
    override?.sundayHours != null && Number.isFinite(Number(override.sundayHours))
      ? Number(override.sundayHours)
      : 0
  );
  const overtimeHours = round2(
    override?.overtimeHours != null &&
      Number.isFinite(Number(override.overtimeHours))
      ? Number(override.overtimeHours)
      : 0
  );

  const saturdayEarnings = round2(
    override?.saturdayEarnings != null &&
      Number.isFinite(Number(override.saturdayEarnings))
      ? Number(override.saturdayEarnings)
      : hospitalityWeekendEarnings(
          ordinaryRate,
          saturdayHours,
          weekend.saturday
        )
  );
  const sundayEarnings = round2(
    override?.sundayEarnings != null &&
      Number.isFinite(Number(override.sundayEarnings))
      ? Number(override.sundayEarnings)
      : hospitalityWeekendEarnings(ordinaryRate, sundayHours, weekend.sunday)
  );

  const allowances = round2(
    override?.allowances != null && Number.isFinite(Number(override.allowances))
      ? Number(override.allowances)
      : 0
  );

  const overtime = round2(
    override?.overtime != null && Number.isFinite(Number(override.overtime))
      ? Number(override.overtime)
      : hospitalityOvertimeAmount(ordinaryRate, overtimeHours)
  );

  const gross = round2(
    ordinaryEarnings +
      saturdayEarnings +
      sundayEarnings +
      allowances +
      overtime
  );
  const ote = round2(
    ordinaryEarnings + saturdayEarnings + sundayEarnings + allowances
  );
  const sgRate = (Number(emp.sgPercent) || SUPER_GUARANTEE_RATE * 100) / 100;
  const superAmount = round2(ote * sgRate);
  const paygWithheld = calculatePaygWithholding({
    grossEarnings: gross,
    frequency,
    residency: emp.residencyStatus === "foreign" ? "foreign" : "resident",
    taxFreeThresholdClaimed: Boolean(emp.taxFreeThreshold),
    hasTfn: Boolean(String(emp.tfn || "").replace(/\D/g, "").length >= 8),
  });
  const net = round2(gross - paygWithheld);

  return {
    employeeId: emp.id,
    employeeName: employeeDisplayName(emp),
    employmentStatus: emp.employmentStatus,
    hours,
    ordinaryRate,
    ordinaryEarnings,
    saturdayHours,
    saturdayEarnings,
    sundayHours,
    sundayEarnings,
    overtimeHours,
    overtime,
    allowances,
    gross,
    ote,
    paygWithheld,
    superAmount,
    net,
  };
}

function sumTotals(lines: PayRunLine[]): PayRunTotals {
  return {
    gross: round2(lines.reduce((s, l) => s + l.gross, 0)),
    paygWithheld: round2(lines.reduce((s, l) => s + l.paygWithheld, 0)),
    superAmount: round2(lines.reduce((s, l) => s + l.superAmount, 0)),
    net: round2(lines.reduce((s, l) => s + l.net, 0)),
    employeeCount: lines.length,
  };
}

export async function createPayRun(input: CreatePayRunInput): Promise<PayRun> {
  return withPayRunsLock(async () => {
    const periodStart = String(input.periodStart || "").trim();
    const periodEnd = String(input.periodEnd || "").trim();
    const paymentDate = String(input.paymentDate || "").trim();
    if (!periodStart || !periodEnd || !paymentDate) {
      throw new Error("Period start, period end and payment date are required");
    }

    const frequency: PayFrequency =
      input.frequency === "weekly" ? "weekly" : "fortnightly";

    const allEmployees = await readEmployees();
    const active = allEmployees.filter((e) => e.employmentStatus !== "terminated");
    const requestedIds = Array.isArray(input.employeeIds)
      ? input.employeeIds.map(String)
      : active.map((e) => e.id);

    if (!requestedIds.length) {
      throw new Error("Select at least one employee");
    }

    const lines: PayRunLine[] = [];
    for (const id of requestedIds) {
      const emp = allEmployees.find((e) => e.id === id);
      if (!emp) throw new Error(`Employee not found: ${id}`);
      if (emp.employmentStatus === "terminated") {
        throw new Error(`Cannot include terminated employee ${employeeDisplayName(emp)}`);
      }
      const override = input.lineOverrides?.[id];
      lines.push(buildPayRunLine(emp, frequency, override));
    }

    const runs = await readPayRunsUnlocked();
    const now = new Date().toISOString();
    const payRun: PayRun = {
      id: `PR-${Date.now()}`,
      number: nextPayRunNumber(runs),
      periodStart,
      periodEnd,
      paymentDate,
      frequency,
      status: "draft",
      employeeIds: requestedIds,
      lines,
      totals: sumTotals(lines),
      ledgerEntryIds: [],
      notes: String(input.notes || "").trim(),
      createdAt: now,
      updatedAt: now,
    };
    runs.unshift(payRun);
    await writePayRunsUnlocked(runs);
    return payRun;
  });
}

export async function updateDraftPayRun(
  id: string,
  patch: Partial<CreatePayRunInput> & {
    lines?: Array<Partial<PayRunLine> & { employeeId: string }>;
  }
): Promise<PayRun> {
  return withPayRunsLock(async () => {
    const runs = await readPayRunsUnlocked();
    const idx = runs.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error("Pay run not found");
    const run = runs[idx];
    if (run.status !== "draft") {
      throw new Error("Only draft pay runs can be edited");
    }

    const frequency: PayFrequency =
      patch.frequency === "weekly" || patch.frequency === "fortnightly"
        ? patch.frequency
        : run.frequency;

    const allEmployees = await readEmployees();
    let employeeIds = Array.isArray(patch.employeeIds)
      ? patch.employeeIds.map(String)
      : [...run.employeeIds];
    let lines = [...run.lines];

    const rebuildLine = (
      empId: string,
      ov?: PayLineOverride & Partial<PayRunLine>
    ): PayRunLine => {
      const emp = allEmployees.find((e) => e.id === empId);
      if (!emp) throw new Error(`Employee not found: ${empId}`);
      const existing = lines.find((l) => l.employeeId === empId);
      const hoursChanged =
        ov?.hours != null &&
        existing != null &&
        Number(ov.hours) !== Number(existing.hours);
      const rateChanged =
        ov?.ordinaryRate != null &&
        existing != null &&
        Number(ov.ordinaryRate) !== Number(existing.ordinaryRate);
      const ordinaryExplicit = ov?.ordinaryEarnings != null;
      const satHoursChanged =
        ov?.saturdayHours != null &&
        existing != null &&
        Number(ov.saturdayHours) !== Number(existing.saturdayHours || 0);
      const sunHoursChanged =
        ov?.sundayHours != null &&
        existing != null &&
        Number(ov.sundayHours) !== Number(existing.sundayHours || 0);
      const otHoursChanged =
        ov?.overtimeHours != null &&
        existing != null &&
        Number(ov.overtimeHours) !== Number(existing.overtimeHours || 0);

      return buildPayRunLine(emp, frequency, {
        hours: ov?.hours ?? existing?.hours,
        ordinaryRate: ov?.ordinaryRate ?? existing?.ordinaryRate,
        allowances: ov?.allowances ?? existing?.allowances,
        saturdayHours: ov?.saturdayHours ?? existing?.saturdayHours ?? 0,
        sundayHours: ov?.sundayHours ?? existing?.sundayHours ?? 0,
        overtimeHours: ov?.overtimeHours ?? existing?.overtimeHours ?? 0,
        ordinaryEarnings: ordinaryExplicit
          ? ov!.ordinaryEarnings
          : hoursChanged || rateChanged
            ? undefined
            : existing?.ordinaryEarnings,
        saturdayEarnings:
          ov?.saturdayEarnings != null
            ? ov.saturdayEarnings
            : satHoursChanged || rateChanged
              ? undefined
              : existing?.saturdayEarnings,
        sundayEarnings:
          ov?.sundayEarnings != null
            ? ov.sundayEarnings
            : sunHoursChanged || rateChanged
              ? undefined
              : existing?.sundayEarnings,
        overtime:
          ov?.overtime != null
            ? ov.overtime
            : otHoursChanged || rateChanged
              ? undefined
              : existing?.overtime,
      });
    };

    if (Array.isArray(patch.employeeIds) || patch.frequency) {
      lines = employeeIds.map((empId) => {
        const ov = (patch.lines || []).find((l) => l.employeeId === empId);
        return rebuildLine(empId, ov);
      });
    } else if (Array.isArray(patch.lines) && patch.lines.length) {
      // Patch one or more employees without resetting the rest
      const byId = new Map(lines.map((l) => [l.employeeId, l]));
      for (const ov of patch.lines) {
        const empId = String(ov.employeeId || "").trim();
        if (!empId) continue;
        if (!employeeIds.includes(empId)) employeeIds.push(empId);
        byId.set(empId, rebuildLine(empId, ov));
      }
      lines = employeeIds
        .map((id) => byId.get(id))
        .filter((l): l is PayRunLine => Boolean(l));
    }

    const next: PayRun = {
      ...run,
      periodStart: String(patch.periodStart || run.periodStart).trim(),
      periodEnd: String(patch.periodEnd || run.periodEnd).trim(),
      paymentDate: String(patch.paymentDate || run.paymentDate).trim(),
      frequency,
      employeeIds: lines.map((l) => l.employeeId),
      lines,
      totals: sumTotals(lines),
      notes:
        patch.notes !== undefined
          ? String(patch.notes || "").trim()
          : run.notes,
      updatedAt: new Date().toISOString(),
    };
    runs[idx] = next;
    await writePayRunsUnlocked(runs);
    return next;
  });
}

export async function deletePayRun(id: string): Promise<boolean> {
  return withPayRunsLock(async () => {
    const runs = await readPayRunsUnlocked();
    const run = runs.find((r) => r.id === id);
    if (!run) return false;
    if (run.status !== "draft") {
      throw new Error("Only draft pay runs can be deleted");
    }
    await writePayRunsUnlocked(runs.filter((r) => r.id !== id));
    return true;
  });
}

function stampId(prefix: string, index: number): string {
  return `${prefix}-${Date.now()}-${index}`;
}

/**
 * Finalise / post pay run to ledger (idempotent if already posted).
 *
 * Dr 1965 Salaries & Wages          gross
 * Cr 909  PAYGW Payable             PAYG
 * Cr 804  Wages Payable             net
 * Dr 1458 Superannuation            SG
 * Cr 805  Superannuation Payable    SG
 */
export async function postPayRun(id: string): Promise<PayRun> {
  return withPayRunsLock(async () => {
    const runs = await readPayRunsUnlocked();
    const idx = runs.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error("Pay run not found");
    const run = runs[idx];

    if (run.status === "posted" || run.status === "stp_submitted") {
      return run; // idempotent
    }
    if (run.ledgerEntryIds.length > 0) {
      throw new Error("Pay run already has ledger entries");
    }
    if (!run.lines.length || run.totals.gross <= 0) {
      throw new Error("Pay run has no amount to post");
    }

    const coa = await readCoa();
    const byCode = new Map(coa.map((a) => [a.code, a]));
    const wagesExp = byCode.get(PAYROLL_COA.wagesExpense);
    const superExp = byCode.get(PAYROLL_COA.superExpense);
    const wagesPay = byCode.get(PAYROLL_COA.wagesPayable);
    const superPay = byCode.get(PAYROLL_COA.superPayable);
    const paygw = byCode.get(PAYROLL_COA.paygwPayable);

    const journalRef = `PAY-${run.number}`;
    const desc = `Pay run ${run.number} (${run.periodStart} – ${run.periodEnd})`;
    const ts = new Date().toISOString();
    const date = run.paymentDate || run.periodEnd;

    const entries: Partial<LedgerEntry>[] = [];
    let i = 0;

    // Dr Salaries & Wages (gross)
    entries.push({
      id: stampId("pay-wages", i++),
      date,
      description: desc,
      amount: run.totals.gross,
      type: wagesExp?.type || "Expense",
      account: `${PAYROLL_COA.wagesExpense} - ${wagesExp?.name || "Salaries & Wages"}`,
      accountCode: PAYROLL_COA.wagesExpense,
      accountName: wagesExp?.name || "Salaries & Wages",
      hasGST: false,
      noGST: true,
      taxCode: "N-T",
      reconciled: false,
      source: "payroll",
      payRunId: run.id,
      payRunNumber: run.number,
      journalRef,
      timestamp: ts,
    });

    // Cr PAYGW Payable
    if (run.totals.paygWithheld > 0.009) {
      entries.push({
        id: stampId("pay-payg", i++),
        date,
        description: desc,
        amount: -run.totals.paygWithheld,
        type: paygw?.type || "Liability",
        account: `${PAYROLL_COA.paygwPayable} - ${paygw?.name || "PAYGW Payable"}`,
        accountCode: PAYROLL_COA.paygwPayable,
        accountName: paygw?.name || "PAYGW Payable",
        hasGST: false,
        noGST: true,
      taxCode: "N-T",
        reconciled: false,
        source: "payroll",
        payRunId: run.id,
        payRunNumber: run.number,
        journalRef,
        timestamp: ts,
      });
    }

    // Cr Wages Payable (net)
    if (run.totals.net > 0.009) {
      entries.push({
        id: stampId("pay-net", i++),
        date,
        description: desc,
        amount: -run.totals.net,
        type: wagesPay?.type || "Liability",
        account: `${PAYROLL_COA.wagesPayable} - ${wagesPay?.name || "Wages Payable"}`,
        accountCode: PAYROLL_COA.wagesPayable,
        accountName: wagesPay?.name || "Wages Payable",
        hasGST: false,
        noGST: true,
      taxCode: "N-T",
        reconciled: false,
        source: "payroll",
        payRunId: run.id,
        payRunNumber: run.number,
        journalRef,
        timestamp: ts,
      });
    }

    // Dr Super expense + Cr Super payable
    if (run.totals.superAmount > 0.009) {
      entries.push({
        id: stampId("pay-sg-exp", i++),
        date,
        description: desc,
        amount: run.totals.superAmount,
        type: superExp?.type || "Expense",
        account: `${PAYROLL_COA.superExpense} - ${superExp?.name || "Superannuation"}`,
        accountCode: PAYROLL_COA.superExpense,
        accountName: superExp?.name || "Superannuation",
        hasGST: false,
        noGST: true,
      taxCode: "N-T",
        reconciled: false,
        source: "payroll",
        payRunId: run.id,
        payRunNumber: run.number,
        journalRef,
        timestamp: ts,
      });
      entries.push({
        id: stampId("pay-sg-liab", i++),
        date,
        description: desc,
        amount: -run.totals.superAmount,
        type: superPay?.type || "Liability",
        account: `${PAYROLL_COA.superPayable} - ${superPay?.name || "Superannuation Payable"}`,
        accountCode: PAYROLL_COA.superPayable,
        accountName: superPay?.name || "Superannuation Payable",
        hasGST: false,
        noGST: true,
      taxCode: "N-T",
        reconciled: false,
        source: "payroll",
        payRunId: run.id,
        payRunNumber: run.number,
        journalRef,
        timestamp: ts,
      });
    }

    const debit = entries
      .filter((e) => (e.amount || 0) > 0)
      .reduce((s, e) => s + (e.amount || 0), 0);
    const credit = entries
      .filter((e) => (e.amount || 0) < 0)
      .reduce((s, e) => s + Math.abs(e.amount || 0), 0);
    if (Math.abs(debit - credit) > 0.02) {
      throw new Error(
        `Unbalanced payroll journal (Dr ${debit} vs Cr ${credit})`
      );
    }

    const result = await appendLedgerEntries(entries);
    const now = new Date().toISOString();
    const next: PayRun = {
      ...run,
      status: "posted",
      ledgerEntryIds: result.savedEntries.map((e) => e.id),
      journalRef,
      postedAt: now,
      updatedAt: now,
    };
    runs[idx] = next;
    await writePayRunsUnlocked(runs);
    return next;
  });
}

/**
 * Mark posted pay run as ready for STP (placeholder — no ATO lodgement).
 */
export async function markPayRunStpReady(id: string): Promise<PayRun> {
  return withPayRunsLock(async () => {
    const runs = await readPayRunsUnlocked();
    const idx = runs.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error("Pay run not found");
    const run = runs[idx];
    if (run.status === "stp_submitted") return run;
    if (run.status !== "posted") {
      throw new Error("Post the pay run before marking STP-ready");
    }
    const next: PayRun = {
      ...run,
      status: "stp_submitted",
      updatedAt: new Date().toISOString(),
    };
    runs[idx] = next;
    await writePayRunsUnlocked(runs);
    return next;
  });
}

export type PayslipYtd = {
  gross: number;
  paygWithheld: number;
  superAmount: number;
  net: number;
};

/** YTD totals for an employee from posted pay runs in the same AU FY as paymentDate. */
export async function computeEmployeeYtd(
  employeeId: string,
  asAtPaymentDate: string,
  excludePayRunId?: string
): Promise<PayslipYtd> {
  const runs = await readPayRunsUnlocked();
  const asAt = new Date(asAtPaymentDate + "T12:00:00");
  const fyStartYear =
    asAt.getMonth() >= 6 ? asAt.getFullYear() : asAt.getFullYear() - 1;
  const fyFrom = `${fyStartYear}-07-01`;
  const fyTo = `${fyStartYear + 1}-06-30`;

  let gross = 0;
  let paygWithheld = 0;
  let superAmount = 0;
  let net = 0;

  for (const run of runs) {
    if (run.status !== "posted" && run.status !== "stp_submitted") continue;
    if (excludePayRunId && run.id === excludePayRunId) continue;
    const payDate = run.paymentDate || run.periodEnd;
    if (payDate < fyFrom || payDate > fyTo) continue;
    if (payDate > asAtPaymentDate) continue;
    const line = run.lines.find((l) => l.employeeId === employeeId);
    if (!line) continue;
    gross += line.gross;
    paygWithheld += line.paygWithheld;
    superAmount += line.superAmount;
    net += line.net;
  }

  return {
    gross: round2(gross),
    paygWithheld: round2(paygWithheld),
    superAmount: round2(superAmount),
    net: round2(net),
  };
}

export async function getPayslipData(payRunId: string, employeeId: string) {
  const run = await getPayRunById(payRunId);
  if (!run) throw new Error("Pay run not found");
  const line = run.lines.find((l) => l.employeeId === employeeId);
  if (!line) throw new Error("Employee not in this pay run");
  const emp = await getEmployeeById(employeeId);
  // Prior posted runs in FY, excluding this run; then add this line for YTD incl. current.
  const ytdPrior = await computeEmployeeYtd(
    employeeId,
    run.paymentDate || run.periodEnd,
    run.id
  );
  const ytd: PayslipYtd = {
    gross: round2(ytdPrior.gross + line.gross),
    paygWithheld: round2(ytdPrior.paygWithheld + line.paygWithheld),
    superAmount: round2(ytdPrior.superAmount + line.superAmount),
    net: round2(ytdPrior.net + line.net),
  };

  return { payRun: run, line, employee: emp, ytd };
}
