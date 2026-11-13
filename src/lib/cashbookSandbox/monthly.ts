/** Amounts the month chart needs. Kept off the filesystem store so the client can import it. */
export type SandboxCloseAmounts = {
  eftposDate: string;
  eftpos1: number | null;
  eftpos2: number | null;
  eftpos3: number | null;
  cashDepositDate: string | null;
  cashDeposit: number | null;
};

export type SandboxCashOutAmount = {
  date: string;
  amount: number;
};

export type MonthCashBar = {
  key: string;
  label: string;
  cashIn: number;
  cashOut: number;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthKey(iso: string | null | undefined): string | null {
  const s = String(iso || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

function eftposTotal(entry: SandboxCloseAmounts): number {
  return round2(
    (entry.eftpos1 || 0) + (entry.eftpos2 || 0) + (entry.eftpos3 || 0)
  );
}

/**
 * Twelve calendar months. Cash in is EFTPOS on the night, cash banked,
 * and wholesale invoices on the day they were entered.
 * Cash out is receipt totals and misc payments.
 */
export function monthlyCashInOut(
  entries: SandboxCloseAmounts[],
  cashOuts: SandboxCashOutAmount[],
  year: number,
  cashIns: SandboxCashOutAmount[] = []
): MonthCashBar[] {
  const bars: MonthCashBar[] = MONTHS.map((label, i) => ({
    key: `${year}-${String(i + 1).padStart(2, "0")}`,
    label,
    cashIn: 0,
    cashOut: 0,
  }));
  const byKey = new Map(bars.map((bar) => [bar.key, bar]));

  for (const entry of entries) {
    const eftpos = eftposTotal(entry);
    const eftposMonth = monthKey(entry.eftposDate);
    if (eftpos > 0 && eftposMonth && byKey.has(eftposMonth)) {
      const bar = byKey.get(eftposMonth)!;
      bar.cashIn = round2(bar.cashIn + eftpos);
    }
    const banked = entry.cashDeposit;
    const bankMonth = monthKey(entry.cashDepositDate);
    if (banked != null && banked > 0 && bankMonth && byKey.has(bankMonth)) {
      const bar = byKey.get(bankMonth)!;
      bar.cashIn = round2(bar.cashIn + banked);
    }
  }

  for (const spend of cashOuts) {
    const key = monthKey(spend.date);
    const amount = round2(Number(spend.amount) || 0);
    if (amount <= 0 || !key || !byKey.has(key)) continue;
    const bar = byKey.get(key)!;
    bar.cashOut = round2(bar.cashOut + amount);
  }

  for (const paid of cashIns) {
    const key = monthKey(paid.date);
    const amount = round2(Number(paid.amount) || 0);
    if (amount <= 0 || !key || !byKey.has(key)) continue;
    const bar = byKey.get(key)!;
    bar.cashIn = round2(bar.cashIn + amount);
  }

  return bars;
}

export function yearsInCloses(
  entries: SandboxCloseAmounts[],
  cashOuts: SandboxCashOutAmount[],
  fallbackYear: number,
  cashIns: SandboxCashOutAmount[] = []
): number[] {
  const years = new Set<number>([fallbackYear]);
  for (const entry of entries) {
    for (const key of [monthKey(entry.eftposDate), monthKey(entry.cashDepositDate)]) {
      if (!key) continue;
      years.add(Number(key.slice(0, 4)));
    }
  }
  for (const spend of cashOuts) {
    const key = monthKey(spend.date);
    if (key) years.add(Number(key.slice(0, 4)));
  }
  for (const paid of cashIns) {
    const key = monthKey(paid.date);
    if (key) years.add(Number(key.slice(0, 4)));
  }
  return [...years].filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
}
