import { promises as fs } from "fs";
import {
  getCashbookSandboxClosesPath,
  getCashbookSandboxDir,
} from "@/lib/dataPaths";
import { sydneyTodayIso } from "@/lib/cashbookSandbox/sydneyDate";

export type CashbookSandboxClose = {
  id: string;
  /** Night the EFTPOS totals belong to (YYYY-MM-DD, Sydney). */
  eftposDate: string;
  eftpos1: number | null;
  eftpos2: number | null;
  eftpos3: number | null;
  /** Day cash was banked (YYYY-MM-DD); only when depositing. */
  cashDepositDate: string | null;
  cashDeposit: number | null;
  createdAt: string;
  updatedAt: string;
};

type CloseStore = {
  entries: CashbookSandboxClose[];
};

function emptyStore(): CloseStore {
  return { entries: [] };
}

function parseAmount(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseDay(raw: unknown, fallback: string | null): string | null {
  const s = String(raw || "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return fallback;
}

export async function ensureCashbookSandbox(): Promise<void> {
  await fs.mkdir(getCashbookSandboxDir(), { recursive: true });
  try {
    await fs.access(getCashbookSandboxClosesPath());
  } catch {
    await fs.writeFile(
      getCashbookSandboxClosesPath(),
      JSON.stringify(emptyStore(), null, 2),
      "utf8"
    );
  }
}

async function readStore(): Promise<CloseStore> {
  await ensureCashbookSandbox();
  try {
    const raw = await fs.readFile(getCashbookSandboxClosesPath(), "utf8");
    const parsed = JSON.parse(raw || "{}") as CloseStore;
    if (!Array.isArray(parsed?.entries)) return emptyStore();
    return { entries: parsed.entries };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: CloseStore): Promise<void> {
  await ensureCashbookSandbox();
  await fs.writeFile(
    getCashbookSandboxClosesPath(),
    JSON.stringify(store, null, 2),
    "utf8"
  );
}

export async function listCashbookSandboxCloses(): Promise<CashbookSandboxClose[]> {
  const store = await readStore();
  return [...store.entries].sort((a, b) =>
    b.eftposDate.localeCompare(a.eftposDate)
  );
}

export async function getCashbookSandboxCloseByEftposDate(
  eftposDate: string
): Promise<CashbookSandboxClose | null> {
  const day = parseDay(eftposDate, null);
  if (!day) return null;
  const store = await readStore();
  return store.entries.find((e) => e.eftposDate === day) || null;
}

export type UpsertCashbookSandboxCloseInput = {
  eftposDate?: string;
  eftpos1?: unknown;
  eftpos2?: unknown;
  eftpos3?: unknown;
  cashDepositDate?: unknown;
  cashDeposit?: unknown;
  /**
   * Photo snap sends one terminal only. Omitted amounts stay on the night.
   * A full save leaves this unset and writes every box, including blanks.
   */
  merge?: boolean;
};

function amountField(
  merge: boolean,
  raw: unknown,
  previous: number | null
): number | null {
  if (raw === undefined) return merge ? previous : null;
  return parseAmount(raw);
}

/** One night after a save. Merge keeps stored amounts the request did not send. */
export function applyClosePatch(
  prev: CashbookSandboxClose | null,
  input: UpsertCashbookSandboxCloseInput,
  now: string
): CashbookSandboxClose {
  const merge = input.merge === true;
  const eftposDate = parseDay(input.eftposDate, sydneyTodayIso()) || sydneyTodayIso();
  const cashDeposit = amountField(merge, input.cashDeposit, prev?.cashDeposit ?? null);
  const cashDepositDate =
    merge && input.cashDeposit === undefined && input.cashDepositDate === undefined
      ? prev?.cashDepositDate ?? null
      : cashDeposit != null
        ? parseDay(input.cashDepositDate, eftposDate)
        : parseDay(input.cashDepositDate, null);

  return {
    id: prev?.id || `cb-${eftposDate}-${Date.now().toString(36)}`,
    eftposDate,
    eftpos1: amountField(merge, input.eftpos1, prev?.eftpos1 ?? null),
    eftpos2: amountField(merge, input.eftpos2, prev?.eftpos2 ?? null),
    eftpos3: amountField(merge, input.eftpos3, prev?.eftpos3 ?? null),
    cashDepositDate,
    cashDeposit,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
  };
}

/** Upsert by eftposDate — practice silo only, never touches live ledger. */
export async function upsertCashbookSandboxClose(
  input: UpsertCashbookSandboxCloseInput
): Promise<CashbookSandboxClose> {
  const now = new Date().toISOString();
  const store = await readStore();
  const idx = store.entries.findIndex((e) => e.eftposDate === eftposDate);
  const saved = applyClosePatch(idx >= 0 ? store.entries[idx] : null, input, now);
  if (idx >= 0) store.entries[idx] = saved;
  else store.entries.push(saved);
  await writeStore(store);
  return saved;
}
