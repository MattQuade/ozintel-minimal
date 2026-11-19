import { promises as fs } from "fs";
import { getBottleShopVisitsPath, getDataDir } from "@/lib/dataPaths";

const KEEP_DAYS = 90;

type VisitFile = { days: Record<string, number> };

let chain: Promise<unknown> = Promise.resolve();

function queue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Calendar day in Australia/Sydney, YYYY-MM-DD. */
export function sydneyVisitDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

async function readFile(): Promise<VisitFile> {
  try {
    const raw = await fs.readFile(getBottleShopVisitsPath(), "utf8");
    const parsed = JSON.parse(raw) as VisitFile;
    if (!parsed?.days || typeof parsed.days !== "object") return { days: {} };
    return { days: parsed.days };
  } catch {
    return { days: {} };
  }
}

function prune(days: Record<string, number>): Record<string, number> {
  const keys = Object.keys(days)
    .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .sort();
  const keep = new Set(keys.slice(-KEEP_DAYS));
  const next: Record<string, number> = {};
  for (const key of keep) {
    const count = Number(days[key]);
    if (Number.isFinite(count) && count > 0) next[key] = count;
  }
  return next;
}

export async function recordBottleShopVisit(
  now = new Date()
): Promise<{ date: string; count: number }> {
  return queue(async () => {
    const date = sydneyVisitDate(now);
    const days = prune((await readFile()).days);
    days[date] = (days[date] || 0) + 1;
    await fs.mkdir(getDataDir(), { recursive: true });
    await fs.writeFile(
      getBottleShopVisitsPath(),
      JSON.stringify({ days }),
      "utf8"
    );
    return { date, count: days[date] };
  });
}

export async function readBottleShopVisits(now = new Date(), limit = 7) {
  const date = sydneyVisitDate(now);
  const days = prune((await readFile()).days);
  const recent = Object.entries(days)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, limit)
    .map(([day, count]) => ({ date: day, count }));
  const monthKey = date.slice(0, 7);
  const month = Object.entries(days).reduce((sum, [day, count]) => {
    return day.startsWith(monthKey) ? sum + count : sum;
  }, 0);
  return { date, today: days[date] || 0, month, days: recent };
}
