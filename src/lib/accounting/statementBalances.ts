import { promises as fs } from "fs";
import { getAccountingDataDir, getReconciliationsFilePath } from "@/lib/dataPaths";
import { toIsoDateInput } from "@/lib/accounting/dates";

export type StatementBalance = {
  bankAccountId: string;
  asAt: string;
  statementBalance: number;
  updatedAt: string;
};

async function loadAll(): Promise<StatementBalance[]> {
  try {
    const raw = await fs.readFile(getReconciliationsFilePath(), "utf8");
    const parsed = JSON.parse(raw || "{}") as { statements?: unknown };
    const rows = Array.isArray(parsed.statements) ? parsed.statements : [];
    return rows
      .map((row) => {
        const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
        const asAt = toIsoDateInput(String(rec.asAt || ""));
        const bankAccountId = String(rec.bankAccountId || "").trim();
        const statementBalance = Number(rec.statementBalance);
        if (!asAt || !bankAccountId || !Number.isFinite(statementBalance)) return null;
        return {
          bankAccountId,
          asAt,
          statementBalance: Math.round(statementBalance * 100) / 100,
          updatedAt: String(rec.updatedAt || ""),
        };
      })
      .filter((row): row is StatementBalance => Boolean(row));
  } catch {
    return [];
  }
}

async function saveAll(rows: StatementBalance[]): Promise<void> {
  await fs.mkdir(getAccountingDataDir(), { recursive: true });
  await fs.writeFile(
    getReconciliationsFilePath(),
    JSON.stringify({ statements: rows }, null, 2),
    "utf8"
  );
}

export async function readStatementBalances(asAt?: string): Promise<StatementBalance[]> {
  const rows = await loadAll();
  const day = asAt ? toIsoDateInput(asAt) : "";
  if (!day) return rows;
  return rows.filter((row) => row.asAt === day);
}

export async function saveStatementBalance(input: {
  bankAccountId: string;
  asAt: string;
  statementBalance: number | null;
}): Promise<StatementBalance | null> {
  const bankAccountId = String(input.bankAccountId || "").trim();
  const asAt = toIsoDateInput(input.asAt);
  if (!bankAccountId || !asAt) {
    throw new Error("bankAccountId and asAt are required");
  }
  const rows = await loadAll();
  const rest = rows.filter((row) => !(row.bankAccountId === bankAccountId && row.asAt === asAt));
  if (input.statementBalance == null || !Number.isFinite(input.statementBalance)) {
    await saveAll(rest);
    return null;
  }
  const next: StatementBalance = {
    bankAccountId,
    asAt,
    statementBalance: Math.round(input.statementBalance * 100) / 100,
    updatedAt: new Date().toISOString(),
  };
  await saveAll([...rest, next]);
  return next;
}
