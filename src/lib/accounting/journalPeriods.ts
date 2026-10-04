/**
 * FY 2026/27 Q1 journal window.
 * CSV rows saved from this period button are tagged Q1 FY26/27.
 */
export const FY2627_Q1 = {
  id: "fy2026-q1",
  label: "FY 2026/2027 Q1",
  csvTag: "Q1 FY26/27",
  from: "2026-07-01",
  to: "2026-09-30",
} as const;

export function fy2627Q1ImportHref(): string {
  const q = new URLSearchParams({
    quarter: FY2627_Q1.csvTag,
    from: FY2627_Q1.from,
    to: FY2627_Q1.to,
  });
  return `/transactions/import?${q.toString()}`;
}

export function isoDateInRange(iso: string, from: string, to: string): boolean {
  return Boolean(iso) && iso >= from && iso <= to;
}
