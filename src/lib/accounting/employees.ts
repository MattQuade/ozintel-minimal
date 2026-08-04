import { promises as fs } from "fs";
import {
  getAccountingDataDir,
  getEmployeesFilePath,
} from "@/lib/dataPaths";
import { SUPER_GUARANTEE_PERCENT } from "@/lib/payroll/constants";

export type EmploymentStatus =
  | "full-time"
  | "part-time"
  | "casual"
  | "terminated";

export type PayBasis = "salary" | "hourly";

export type ResidencyStatus = "resident" | "foreign";

export type TaxScaleType =
  | "standard"
  | "working_holiday_maker"
  | "no_tfn";

export type EmployeePayFrequency = "weekly" | "fortnightly";

export type Employee = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  preferredName: string;
  email: string;
  phone: string;
  addressStreet: string;
  addressSuburb: string;
  addressState: string;
  addressPostcode: string;
  dateOfBirth: string;
  startDate: string;
  employmentStatus: EmploymentStatus;
  position: string;
  department: string;
  /** Optional award / classification shown on payslips. */
  classification: string;
  /** Tax file number — never log this field. */
  tfn: string;
  residencyStatus: ResidencyStatus;
  taxFreeThreshold: boolean;
  /** Stored for STP/display; PAYG calc still uses residency + TFT for MVP. */
  taxScaleType: TaxScaleType;
  payBasis: PayBasis;
  /** Default pay calendar for this employee (pay template). */
  payFrequency: EmployeePayFrequency;
  /** Annual salary (salary basis) or hourly rate (hourly basis) — pay template. */
  ordinaryRate: number;
  /** Template ordinary hours per week. */
  standardHoursPerWeek: number;
  bankAccountName: string;
  bsb: string;
  accountNumber: string;
  superFundName: string;
  superUsi: string;
  superAbn: string;
  superMemberNumber: string;
  /** Employer SG % (e.g. 12). */
  sgPercent: number;
  /** Optional leave balances (hours) — accrual engine out of scope. */
  leaveAnnualHours: number;
  leaveSickHours: number;
  /** Free-text employee notes. */
  notes: string;
  createdAt: string;
  updatedAt: string;
};

let employeesChain: Promise<unknown> = Promise.resolve();
function withEmployeesLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = employeesChain.then(fn, fn);
  employeesChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function ensureDir() {
  await fs.mkdir(getAccountingDataDir(), { recursive: true });
}

async function writeEmployeesUnlocked(employees: Employee[]) {
  await ensureDir();
  const target = getEmployeesFilePath();
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(employees, null, 2), "utf8");
  try {
    await fs.rename(tmp, target);
  } catch {
    await fs.copyFile(tmp, target);
    await fs.unlink(tmp).catch(() => undefined);
  }
}

async function readEmployeesUnlocked(): Promise<Employee[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(getEmployeesFilePath(), "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as Employee[]) : [];
  } catch {
    await writeEmployeesUnlocked([]);
    return [];
  }
}

export async function readEmployees(): Promise<Employee[]> {
  return readEmployeesUnlocked();
}

export async function writeEmployees(employees: Employee[]): Promise<void> {
  return withEmployeesLock(() => writeEmployeesUnlocked(employees));
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  const employees = await readEmployeesUnlocked();
  return employees.find((e) => e.id === id) || null;
}

export function employeeDisplayName(e: Employee): string {
  const preferred = String(e.preferredName || "").trim();
  const legal = `${e.legalFirstName} ${e.legalLastName}`.trim();
  return preferred || legal || e.id;
}

export function maskTfn(tfn: string): string {
  const digits = String(tfn || "").replace(/\D/g, "");
  if (!digits) return "—";
  if (digits.length <= 3) return "***";
  return `***${digits.slice(-3)}`;
}

function asEmploymentStatus(v: unknown): EmploymentStatus {
  const s = String(v || "").toLowerCase();
  if (s === "part-time" || s === "part time") return "part-time";
  if (s === "casual") return "casual";
  if (s === "terminated") return "terminated";
  return "full-time";
}

function asPayBasis(v: unknown): PayBasis {
  return String(v || "").toLowerCase() === "hourly" ? "hourly" : "salary";
}

function asResidency(v: unknown): ResidencyStatus {
  const s = String(v || "").toLowerCase();
  if (s.includes("foreign") || s.includes("non-resident") || s === "non_resident") {
    return "foreign";
  }
  return "resident";
}

function asTaxScale(v: unknown): TaxScaleType {
  const s = String(v || "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (s.includes("working") || s === "whm") return "working_holiday_maker";
  if (s.includes("no-tfn") || s === "notfn") return "no_tfn";
  return "standard";
}

function asPayFrequency(v: unknown): EmployeePayFrequency {
  return String(v || "").toLowerCase() === "fortnightly"
    ? "fortnightly"
    : "weekly";
}

function normalizeEmployee(
  input: Partial<Employee>,
  existing?: Employee
): Employee {
  const now = new Date().toISOString();
  const legalFirstName = String(
    input.legalFirstName ?? existing?.legalFirstName ?? ""
  ).trim();
  const legalLastName = String(
    input.legalLastName ?? existing?.legalLastName ?? ""
  ).trim();
  if (!legalFirstName || !legalLastName) {
    throw new Error("Legal first and last name are required");
  }

  const ordinaryRate = Number(
    input.ordinaryRate ?? existing?.ordinaryRate ?? 0
  );
  if (!Number.isFinite(ordinaryRate) || ordinaryRate < 0) {
    throw new Error("Ordinary rate must be a non-negative number");
  }

  const sgPercent = Number(
    input.sgPercent ?? existing?.sgPercent ?? SUPER_GUARANTEE_PERCENT
  );

  return {
    id: String(input.id || existing?.id || `EMP-${Date.now()}`),
    legalFirstName,
    legalLastName,
    preferredName: String(
      input.preferredName ?? existing?.preferredName ?? ""
    ).trim(),
    email: String(input.email ?? existing?.email ?? "").trim(),
    phone: String(input.phone ?? existing?.phone ?? "").trim(),
    addressStreet: String(
      input.addressStreet ?? existing?.addressStreet ?? ""
    ).trim(),
    addressSuburb: String(
      input.addressSuburb ?? existing?.addressSuburb ?? ""
    ).trim(),
    addressState: String(
      input.addressState ?? existing?.addressState ?? "NSW"
    ).trim(),
    addressPostcode: String(
      input.addressPostcode ?? existing?.addressPostcode ?? ""
    ).trim(),
    dateOfBirth: String(input.dateOfBirth ?? existing?.dateOfBirth ?? "").trim(),
    startDate: String(input.startDate ?? existing?.startDate ?? "").trim(),
    employmentStatus: asEmploymentStatus(
      input.employmentStatus ?? existing?.employmentStatus
    ),
    position: String(input.position ?? existing?.position ?? "").trim(),
    department: String(input.department ?? existing?.department ?? "").trim(),
    classification: String(
      input.classification ?? existing?.classification ?? ""
    ).trim(),
    tfn: String(input.tfn ?? existing?.tfn ?? "").replace(/\s/g, ""),
    residencyStatus: asResidency(
      input.residencyStatus ?? existing?.residencyStatus
    ),
    taxFreeThreshold: Boolean(
      input.taxFreeThreshold ?? existing?.taxFreeThreshold ?? true
    ),
    taxScaleType: asTaxScale(input.taxScaleType ?? existing?.taxScaleType),
    payBasis: asPayBasis(input.payBasis ?? existing?.payBasis),
    payFrequency: asPayFrequency(
      input.payFrequency ?? existing?.payFrequency
    ),
    ordinaryRate,
    standardHoursPerWeek: Math.max(
      0,
      Number(
        input.standardHoursPerWeek ?? existing?.standardHoursPerWeek ?? 38
      ) || 0
    ),
    bankAccountName: String(
      input.bankAccountName ?? existing?.bankAccountName ?? ""
    ).trim(),
    bsb: String(input.bsb ?? existing?.bsb ?? "").trim(),
    accountNumber: String(
      input.accountNumber ?? existing?.accountNumber ?? ""
    ).trim(),
    superFundName: String(
      input.superFundName ?? existing?.superFundName ?? ""
    ).trim(),
    superUsi: String(input.superUsi ?? existing?.superUsi ?? "").trim(),
    superAbn: String(input.superAbn ?? existing?.superAbn ?? "").trim(),
    superMemberNumber: String(
      input.superMemberNumber ?? existing?.superMemberNumber ?? ""
    ).trim(),
    sgPercent: Number.isFinite(sgPercent) ? sgPercent : SUPER_GUARANTEE_PERCENT,
    leaveAnnualHours: Math.max(
      0,
      Number(input.leaveAnnualHours ?? existing?.leaveAnnualHours ?? 0) || 0
    ),
    leaveSickHours: Math.max(
      0,
      Number(input.leaveSickHours ?? existing?.leaveSickHours ?? 0) || 0
    ),
    notes: String(input.notes ?? existing?.notes ?? "").trim(),
    createdAt: existing?.createdAt || input.createdAt || now,
    updatedAt: now,
  };
}

export async function upsertEmployee(
  input: Partial<Employee>
): Promise<Employee> {
  return withEmployeesLock(async () => {
    const employees = await readEmployeesUnlocked();
    const id = input.id ? String(input.id) : "";
    const idx = id ? employees.findIndex((e) => e.id === id) : -1;
    const next = normalizeEmployee(
      input,
      idx >= 0 ? employees[idx] : undefined
    );
    if (idx >= 0) employees[idx] = next;
    else employees.push(next);
    await writeEmployeesUnlocked(employees);
    return next;
  });
}

export async function deleteEmployee(id: string): Promise<boolean> {
  return withEmployeesLock(async () => {
    const employees = await readEmployeesUnlocked();
    const next = employees.filter((e) => e.id !== id);
    if (next.length === employees.length) return false;
    await writeEmployeesUnlocked(next);
    return true;
  });
}
