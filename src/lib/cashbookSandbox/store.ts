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
};

/** Upsert by eftposDate — practice silo only, never touches live ledger. */
export async function upsertCashbookSandboxClose(
  input: UpsertCashbookSandboxCloseInput
): Promise<CashbookSandboxClose> {
  const now = new Date().toISOString();
  const eftposDate = parseDay(input.eftposDate, sydneyTodayIso()) || sydneyTodayIso();
  const cashDeposit = parseAmount(input.cashDeposit);
  const cashDepositDate =
    cashDeposit != null
      ? parseDay(input.cashDepositDate, eftposDate)
      : parseDay(input.cashDepositDate, null);

  const next: Omit<CashbookSandboxClose, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  } = {
    eftposDate,
    eftpos1: parseAmount(input.eftpos1),
    eftpos2: parseAmount(input.eftpos2),
    eftpos3: parseAmount(input.eftpos3),
    cashDepositDate,
    cashDeposit,
    updatedAt: now,
  };

  const store = await readStore();
  const idx = store.entries.findIndex((e) => e.eftposDate === eftposDate);
  let saved: CashbookSandboxClose;
  if (idx >= 0) {
    saved = {
      ...store.entries[idx],
      ...next,
      id: store.entries[idx].id,
      createdAt: store.entries[idx].createdAt,
    };
    store.entries[idx] = saved;
  } else {
    saved = {
      id: `cb-${eftposDate}-${Date.now().toString(36)}`,
      eftposDate: next.eftposDate,
      eftpos1: next.eftpos1,
      eftpos2: next.eftpos2,
      eftpos3: next.eftpos3,
      cashDepositDate: next.cashDepositDate,
      cashDeposit: next.cashDeposit,
      createdAt: now,
      updatedAt: now,
    };
    store.entries.push(saved);
  }
  await writeStore(store);
  return saved;
}
