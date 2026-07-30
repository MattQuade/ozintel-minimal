/**
 * Normalize ANZ/NAB bank export rows to [date, amount, description].
 */

function normHeader(cell: unknown): string {
  return String(cell ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function findCol(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const i = headers.findIndex((h) => h === name || h.includes(name));
    if (i >= 0) return i;
  }
  return -1;
}

function looksLikeAccountNumber(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return /^\d{6,12}$/.test(s);
}

/** NAB export: Date, Amount, Account Number, …, Transaction Details, … */
function parseNabLayout(row: unknown[]): [string, string, string] | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  const date = String(row[0] ?? "").trim();
  const amount = String(row[1] ?? "").trim();
  const details = String(row[5] ?? row[4] ?? "").trim();
  if (!date || amount === "" || !details) return null;
  if (normHeader(date) === "date") return null;
  return [date, amount, details];
}

export function normalizeBankImportRows(raw: unknown[][]): string[][] {
  if (!raw.length) return [];

  const first = raw[0].map(normHeader);
  const hasNabHeader =
    first.includes("transaction details") ||
    (first.includes("date") &&
      first.includes("amount") &&
      first.some((h) => h.includes("transaction")));

  if (hasNabHeader) {
    const dateCol = findCol(first, "date");
    const amountCol = findCol(first, "amount");
    const detailsCol = findCol(first, "transaction details");
    const out: string[][] = [];
    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (!Array.isArray(row)) continue;
      const date = String(row[dateCol] ?? "").trim();
      const amount = String(row[amountCol] ?? "").trim();
      const details = String(row[detailsCol] ?? "").trim();
      if (!date || amount === "" || !details) continue;
      if (amount === "0" && /interest rate|please note/i.test(details)) continue;
      out.push([date, amount, details]);
    }
    return out;
  }

  // NAB without header row (account number in column 3)
  if (raw.length > 0 && looksLikeAccountNumber(raw[0][2])) {
    const out: string[][] = [];
    for (const row of raw) {
      const parsed = parseNabLayout(row);
      if (!parsed) continue;
      if (parsed[1] === "0" && /interest rate|please note/i.test(parsed[2])) continue;
      out.push(parsed);
    }
    if (out.length) return out;
  }

  // Simple ANZ-style: date, amount, description (+ optional extra columns joined)
  const out: string[][] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const date = String(row[0] ?? "").trim();
    const amount = String(row[1] ?? "").trim();
    if (normHeader(date) === "date") continue;
    if (!date || amount === "") continue;
    const description = row
      .slice(2)
      .map((c) => String(c ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (!description) continue;
    out.push([date, amount, description]);
  }
  return out;
}
