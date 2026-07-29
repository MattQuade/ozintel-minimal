import { promises as fs } from "fs";
import {
  getKegsArchiveDir,
  getKegsArchiveFilePath,
  getKegsFilePath,
  getPubOpsDataDir,
} from "@/lib/dataPaths";

export type KegType = "in" | "out";

export type KegEntry = {
  id: string;
  date: string; // YYYY-MM-DD (Australia/Sydney calendar day)
  type: KegType;
  quantity: number;
  createdAt: string;
};

export type KegTotals = {
  totalIn: number;
  totalOut: number;
  net: number;
};

type KegStore = {
  month: string; // YYYY-MM
  entries: KegEntry[];
};

export type KegMonthSnapshot = {
  month: string;
  archivedAt: string;
  entries: KegEntry[];
  totals: KegTotals;
  locked: true;
};

function sydneyDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function currentMonthKey(d = new Date()): string {
  return sydneyDateString(d).slice(0, 7);
}

export function todaySydney(): string {
  return sydneyDateString();
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function totalsFromEntries(entries: KegEntry[]): KegTotals {
  let totalIn = 0;
  let totalOut = 0;
  for (const e of entries) {
    if (e.type === "in") totalIn += e.quantity;
    else totalOut += e.quantity;
  }
  return { totalIn, totalOut, net: totalIn - totalOut };
}

function emptyStore(month = currentMonthKey()): KegStore {
  return { month, entries: [] };
}

function isValidDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

async function ensureDirs() {
  await fs.mkdir(getPubOpsDataDir(), { recursive: true });
  await fs.mkdir(getKegsArchiveDir(), { recursive: true });
}

async function writeStore(store: KegStore) {
  await ensureDirs();
  await fs.writeFile(getKegsFilePath(), JSON.stringify(store, null, 2), "utf8");
}

async function archiveMonth(store: KegStore) {
  if (!store.entries.length && !store.month) return;
  await ensureDirs();
  const archivePath = getKegsArchiveFilePath(store.month);
  try {
    await fs.access(archivePath);
    // Already archived — do not overwrite (uneditable)
    return;
  } catch {
    // create archive
  }
  const snapshot: KegMonthSnapshot = {
    month: store.month,
    archivedAt: new Date().toISOString(),
    entries: store.entries,
    totals: totalsFromEntries(store.entries),
    locked: true,
  };
  await fs.writeFile(archivePath, JSON.stringify(snapshot, null, 2), "utf8");
}

function migrateLegacy(parsed: Record<string, unknown>): KegStore {
  const month = currentMonthKey();
  const entries: KegEntry[] = Array.isArray(parsed.entries)
    ? (parsed.entries as KegEntry[])
    : [];

  if (entries.length > 0) {
    return {
      month: typeof parsed.month === "string" ? parsed.month : month,
      entries: entries.map((e) => ({
        id: e.id || newId(),
        date: e.date || `${month}-01`,
        type: e.type === "out" ? "out" : "in",
        quantity: Math.max(0, Math.floor(Number(e.quantity) || 0)),
        createdAt: e.createdAt || new Date().toISOString(),
      })),
    };
  }

  // Old { totalIn, totalOut } shape → one dated opening row each
  const totalIn = Math.floor(Number(parsed.totalIn) || 0);
  const totalOut = Math.floor(Number(parsed.totalOut) || 0);
  const openingDate = `${month}-01`;
  if (totalIn > 0) {
    entries.push({
      id: newId(),
      date: openingDate,
      type: "in",
      quantity: totalIn,
      createdAt: new Date().toISOString(),
    });
  }
  if (totalOut > 0) {
    entries.push({
      id: newId(),
      date: openingDate,
      type: "out",
      quantity: totalOut,
      createdAt: new Date().toISOString(),
    });
  }
  return { month, entries };
}

async function readStoreRaw(): Promise<KegStore> {
  await ensureDirs();
  const file = getKegsFilePath();
  try {
    await fs.access(file);
  } catch {
    const fresh = emptyStore();
    await writeStore(fresh);
    return fresh;
  }
  const raw = await fs.readFile(file, "utf8");
  const parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
  return migrateLegacy(parsed);
}

/** Load current month; auto-archive previous month when calendar month rolls over. */
export async function loadCurrentMonth(): Promise<{
  store: KegStore;
  totals: KegTotals;
  archivedPrevious: boolean;
}> {
  let store = await readStoreRaw();
  const nowMonth = currentMonthKey();
  let archivedPrevious = false;

  if (store.month && store.month !== nowMonth) {
    await archiveMonth(store);
    archivedPrevious = true;
    store = emptyStore(nowMonth);
    await writeStore(store);
  } else if (!store.month) {
    store.month = nowMonth;
    await writeStore(store);
  }

  return {
    store,
    totals: totalsFromEntries(store.entries),
    archivedPrevious,
  };
}

export async function listArchiveMonths(): Promise<string[]> {
  await ensureDirs();
  try {
    const files = await fs.readdir(getKegsArchiveDir());
    return files
      .filter((f) => /^kegs-\d{4}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/^kegs-/, "").replace(/\.json$/, ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function readArchive(
  month: string
): Promise<KegMonthSnapshot | null> {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  try {
    const raw = await fs.readFile(getKegsArchiveFilePath(month), "utf8");
    return JSON.parse(raw) as KegMonthSnapshot;
  } catch {
    return null;
  }
}

export async function addKegEntry(input: {
  type: KegType;
  quantity: number;
  date?: string;
}): Promise<{ store: KegStore; totals: KegTotals }> {
  const qty = Math.floor(Number(input.quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Quantity must be a positive number");
  }
  const date = input.date?.trim() || todaySydney();
  if (!isValidDate(date)) throw new Error("Date must be YYYY-MM-DD");

  const { store } = await loadCurrentMonth();
  if (date.slice(0, 7) !== store.month) {
    throw new Error(
      `Date must be in the current month (${store.month}). Past months are locked after month-end.`
    );
  }

  store.entries.push({
    id: newId(),
    date,
    type: input.type,
    quantity: qty,
    createdAt: new Date().toISOString(),
  });
  store.entries.sort((a, b) =>
    a.date === b.date
      ? a.createdAt.localeCompare(b.createdAt)
      : a.date.localeCompare(b.date)
  );
  await writeStore(store);
  return { store, totals: totalsFromEntries(store.entries) };
}

export async function updateKegEntry(
  id: string,
  quantity: number
): Promise<{ store: KegStore; totals: KegTotals }> {
  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Quantity must be a positive number");
  }
  const { store } = await loadCurrentMonth();
  const idx = store.entries.findIndex((e) => e.id === id);
  if (idx < 0) throw new Error("Entry not found");
  store.entries[idx].quantity = qty;
  await writeStore(store);
  return { store, totals: totalsFromEntries(store.entries) };
}

export async function deleteKegEntry(
  id: string
): Promise<{ store: KegStore; totals: KegTotals }> {
  const { store } = await loadCurrentMonth();
  const next = store.entries.filter((e) => e.id !== id);
  if (next.length === store.entries.length) throw new Error("Entry not found");
  store.entries = next;
  await writeStore(store);
  return { store, totals: totalsFromEntries(store.entries) };
}
