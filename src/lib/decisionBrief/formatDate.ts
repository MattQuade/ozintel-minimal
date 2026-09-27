/** Format ISO / YYYY-MM-DD timestamps as Australian dd/mm/yyyy (no timezone shift). */
export function formatAuDate(iso: string | undefined | null): string {
  const raw = String(iso || "").trim();
  if (!raw) return "—";
  const dayPart = raw.slice(0, 10);
  const m = dayPart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try {
    return new Date(raw).toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Australia/Sydney",
    });
  } catch {
    return raw;
  }
}
