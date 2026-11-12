/** Calendar day in Australia/Sydney as YYYY-MM-DD. */
export function sydneyTodayIso(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** YYYY-MM-DD → dd/mm/yyyy for display. */
export function formatAuDay(iso: string): string {
  const m = String(iso || "")
    .trim()
    .slice(0, 10)
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso || "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Long AU weekday label, e.g. Thursday 12/11/2026. */
export function formatAuDayLong(iso: string): string {
  const m = String(iso || "")
    .trim()
    .slice(0, 10)
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return formatAuDay(iso);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  const weekday = d.toLocaleDateString("en-AU", {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${weekday} ${m[3]}/${m[2]}/${m[1]}`;
}
