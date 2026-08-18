import { promises as fs } from "fs";
import { getAccountingDataDir } from "@/lib/dataPaths";
import { parseFlexibleDate, toIsoDateInput } from "@/lib/accounting/dates";
import { GST_METHOD } from "@/lib/accounting/gstTax";

export type BasPeriodStatus = "open" | "locked" | "lodged";

export type BasPeriodRecord = {
  quarterId: string;
  from: string;
  to: string;
  label: string;
  status: BasPeriodStatus;
  gstMethod: typeof GST_METHOD;
  snapshot: Record<string, unknown> | null;
  lockedAt?: string;
  lodgedAt?: string;
  unlockedAt?: string;
};

export type AccountingSettings = {
  gstMethod: typeof GST_METHOD;
};

function settingsPath() {
  return `${getAccountingDataDir()}/settings.json`;
}

function periodsPath() {
  return `${getAccountingDataDir()}/bas-periods.json`;
}

async function ensureDir() {
  await fs.mkdir(getAccountingDataDir(), { recursive: true });
}

export async function readAccountingSettings(): Promise<AccountingSettings> {
  await ensureDir();
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(raw || "{}") as Partial<AccountingSettings>;
    void parsed;
    return { gstMethod: GST_METHOD };
  } catch {
    const settings: AccountingSettings = { gstMethod: GST_METHOD };
    await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
    return settings;
  }
}

export async function readBasPeriods(): Promise<BasPeriodRecord[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(periodsPath(), "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as BasPeriodRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeBasPeriods(rows: BasPeriodRecord[]) {
  await ensureDir();
  const target = periodsPath();
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf8");
  try {
    await fs.rename(tmp, target);
  } catch {
    await fs.copyFile(tmp, target);
    await fs.unlink(tmp).catch(() => undefined);
  }
}

export function dateIso(input: string | undefined): string {
  return toIsoDateInput(parseFlexibleDate(input) || input || "") || "";
}

export function lockedPeriodForDate(
  periods: BasPeriodRecord[],
  isoDate: string
): BasPeriodRecord | undefined {
  if (!isoDate) return undefined;
  return periods.find(
    (p) =>
      (p.status === "locked" || p.status === "lodged") &&
      isoDate >= p.from &&
      isoDate <= p.to
  );
}

export async function assertDatesUnlocked(dates: Array<string | undefined>) {
  const periods = await readBasPeriods();
  for (const d of dates) {
    const iso = dateIso(String(d || ""));
    const hit = lockedPeriodForDate(periods, iso);
    if (hit) {
      throw new Error(
        `Ledger is locked for ${hit.label} (${hit.from} to ${hit.to}). Unlock the BAS quarter before changing entries in that period.`
      );
    }
  }
}

export async function upsertBasPeriod(
  patch: BasPeriodRecord
): Promise<BasPeriodRecord> {
  const rows = await readBasPeriods();
  const idx = rows.findIndex((r) => r.quarterId === patch.quarterId);
  if (idx >= 0) rows[idx] = patch;
  else rows.push(patch);
  await writeBasPeriods(rows);
  return patch;
}

export function periodByQuarterId(
  rows: BasPeriodRecord[],
  quarterId: string
): BasPeriodRecord | undefined {
  return rows.find((r) => r.quarterId === quarterId);
}
