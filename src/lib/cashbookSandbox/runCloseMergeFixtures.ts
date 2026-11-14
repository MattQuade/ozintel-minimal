/**
 * A photo snap must change one EFTPOS terminal and leave the rest of the night.
 * Run: npx tsx src/lib/cashbookSandbox/runCloseMergeFixtures.ts
 */

import {
  applyClosePatch,
  type CashbookSandboxClose,
} from "@/lib/cashbookSandbox/store";

type Check = { name: string; ok: boolean; detail: string };

function eq(name: string, got: unknown, want: unknown): Check {
  const ok = got === want;
  return { name, ok, detail: ok ? String(got) : `got ${got} want ${want}` };
}

const prev: CashbookSandboxClose = {
  id: "cb-2026-11-14",
  eftposDate: "2026-11-14",
  eftpos1: 400,
  eftpos2: 500,
  eftpos3: 411.1,
  cashDepositDate: "2026-11-14",
  cashDeposit: 200,
  createdAt: "2026-11-14T00:00:00.000Z",
  updatedAt: "2026-11-14T00:00:00.000Z",
};

const snapped = applyClosePatch(
  prev,
  { merge: true, eftposDate: "2026-11-14", eftpos1: 702.1 },
  "2026-11-14T10:00:00.000Z"
);

const replaced = applyClosePatch(
  prev,
  {
    eftposDate: "2026-11-14",
    eftpos1: 702.1,
    eftpos2: null,
    eftpos3: null,
    cashDeposit: null,
    cashDepositDate: null,
  },
  "2026-11-14T10:00:00.000Z"
);

const checks: Check[] = [
  eq("snap keeps terminal 2", snapped.eftpos2, 500),
  eq("snap keeps terminal 3", snapped.eftpos3, 411.1),
  eq("snap keeps cash banked", snapped.cashDeposit, 200),
  eq("snap sets terminal 1", snapped.eftpos1, 702.1),
  eq("full save clears terminal 2", replaced.eftpos2, null),
  eq("full save clears cash banked", replaced.cashDeposit, null),
  eq("full save sets terminal 1", replaced.eftpos1, 702.1),
];

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? "OK" : "FAIL"}  ${c.name}: ${c.detail}`);
}
console.log(failed ? `\n${failed} failed` : `\nAll ${checks.length} passed`);
process.exit(failed ? 1 : 0);
