/**
 * Journal period tabs. FY26/27 Q1 CSV rows are tagged Q1 FY26/27.
 */
export type JournalPeriod = {
  id: string;
  label: string;
  from: string;
  to: string;
};

function fyQuarters(startYear: number): JournalPeriod[] {
  const yy = String(startYear).slice(2);
  const next = String(startYear + 1).slice(2);
  return [
    {
      id: `fy${startYear}`,
      label: `Full Year FY${yy}/${next}`,
      from: `${startYear}-07-01`,
      to: `${startYear + 1}-06-30`,
    },
    {
      id: `fy${startYear}-q1`,
      label: `Q1 Jul–Sep ${startYear}`,
      from: `${startYear}-07-01`,
      to: `${startYear}-09-30`,
    },
    {
      id: `fy${startYear}-q2`,
      label: `Q2 Oct–Dec ${startYear}`,
      from: `${startYear}-10-01`,
      to: `${startYear}-12-31`,
    },
    {
      id: `fy${startYear}-q3`,
      label: `Q3 Jan–Mar ${startYear + 1}`,
      from: `${startYear + 1}-01-01`,
      to: `${startYear + 1}-03-31`,
    },
    {
      id: `fy${startYear}-q4`,
      label: `Q4 Apr–Jun ${startYear + 1}`,
      from: `${startYear + 1}-04-01`,
      to: `${startYear + 1}-06-30`,
    },
  ];
}

/** Current FY first, then the previous FY — same order as the period bar. */
export const JOURNAL_PERIODS: JournalPeriod[] = [
  ...fyQuarters(2026),
  ...fyQuarters(2025),
];

export const FY2627_Q1 = {
  id: "fy2026-q1",
  label: "Q1 Jul–Sep 2026",
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
