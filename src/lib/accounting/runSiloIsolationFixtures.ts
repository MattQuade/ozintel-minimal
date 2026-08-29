/**
 * Two accounting users must never see each other's books.
 * Run: npx tsx src/lib/accounting/runSiloIsolationFixtures.ts
 */

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { runWithDataOwnerAsync } from "../dataOwnerContext";
import {
  getAccountingDataDir,
  getBankAccountsFilePath,
  getLedgerFilePath,
} from "../dataPaths";
import {
  ensureOwnerAccountingSilo,
  readBankAccounts,
  readCoa,
  readLedger,
  readRules,
  writeLedger,
} from "./store";

type Check = { name: string; ok: boolean; detail: string };

function eq(name: string, actual: unknown, expected: unknown): Check {
  const ok = actual === expected;
  return {
    name,
    ok,
    detail: ok ? String(actual) : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  };
}

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ozintel-silo-"));
  process.env.OZINTEL_DATA_DIR = dir;

  const ownerA = "matt-test@ozintel.com.au";
  const ownerB = "new-user@example.com";
  const checks: Check[] = [];

  await ensureOwnerAccountingSilo(ownerA);
  await runWithDataOwnerAsync(ownerA, async () => {
    await writeLedger([
      {
        id: "LE-MATT-ONLY",
        date: "2026-08-01",
        description: "Matt private transaction",
        amount: 123.45,
        type: "spend",
      },
    ]);
  });

  await ensureOwnerAccountingSilo(ownerB);

  const aLedger = await runWithDataOwnerAsync(ownerA, () => readLedger());
  const bLedger = await runWithDataOwnerAsync(ownerB, () => readLedger());
  const bBanks = await runWithDataOwnerAsync(ownerB, () => readBankAccounts());
  const bRules = await runWithDataOwnerAsync(ownerB, () => readRules());
  const bCoa = await runWithDataOwnerAsync(ownerB, () => readCoa());
  const aDir = await runWithDataOwnerAsync(ownerA, async () => getAccountingDataDir());
  const bDir = await runWithDataOwnerAsync(ownerB, async () => getAccountingDataDir());
  const aLedgerPath = await runWithDataOwnerAsync(ownerA, async () =>
    getLedgerFilePath()
  );
  const bBankPath = await runWithDataOwnerAsync(ownerB, async () =>
    getBankAccountsFilePath()
  );

  checks.push(eq("A still has own ledger row", aLedger.length, 1));
  checks.push(
    eq("A ledger id is private", aLedger[0]?.id, "LE-MATT-ONLY")
  );
  checks.push(eq("B ledger starts empty", bLedger.length, 0));
  checks.push(eq("B banks start empty (not NAB/ANZ)", bBanks.length, 0));
  checks.push(eq("B rules start empty", bRules.length, 0));
  checks.push(
    eq("B gets product COA template", bCoa.length > 0, true)
  );
  checks.push(eq("silo folders differ", aDir === bDir, false));
  checks.push(
    eq(
      "A path contains A email",
      aLedgerPath.toLowerCase().includes("matt-test@ozintel.com.au"),
      true
    )
  );
  checks.push(
    eq(
      "B path contains B email",
      bBankPath.toLowerCase().includes("new-user@example.com"),
      true
    )
  );
  checks.push(
    eq(
      "B ledger has none of A's ids",
      bLedger.some((row) => row.id === "LE-MATT-ONLY"),
      false
    )
  );

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? "ok" : "FAIL"}  ${c.name} — ${c.detail}`);
  }
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  if (failed.length) {
    console.error(`\n${failed.length} silo check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll silo isolation checks passed");
}

void main();
