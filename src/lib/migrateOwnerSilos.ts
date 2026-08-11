import path from "path";
import { promises as fs } from "fs";
import {
  getDataDir,
  getLegacyAccountingDataDir,
  getLegacyForestryDataDir,
  getLegacyPubOpsDataDir,
  getOwnerDataRoot,
} from "@/lib/dataPaths";
import { normalizeOwnerEmail } from "@/lib/dataOwnerContext";

const MIGRATION_MARKER = ".owner-silo-migration-v1";

/**
 * Move legacy global module folders into owners/{email}/ once.
 * Default owner: OZINTEL_DEFAULT_OWNER_EMAIL, else mattquade2000@gmail.com.
 */
export async function ensureOwnerSiloMigration(): Promise<void> {
  const root = getDataDir();
  const marker = path.join(root, MIGRATION_MARKER);
  try {
    await fs.access(marker);
    return;
  } catch {
    // not migrated yet
  }

  await fs.mkdir(root, { recursive: true });

  const owner = normalizeOwnerEmail(
    process.env.OZINTEL_DEFAULT_OWNER_EMAIL || "mattquade2000@gmail.com"
  );
  const ownerRoot = getOwnerDataRoot(owner);
  await fs.mkdir(ownerRoot, { recursive: true });

  const moves: Array<{ from: string; to: string }> = [
    {
      from: getLegacyPubOpsDataDir(),
      to: path.join(ownerRoot, "operations", "pub"),
    },
    {
      from: getLegacyForestryDataDir(),
      to: path.join(ownerRoot, "operations", "forestry"),
    },
    {
      from: getLegacyAccountingDataDir(),
      to: path.join(ownerRoot, "accounting"),
    },
  ];

  for (const { from, to } of moves) {
    try {
      await fs.access(from);
    } catch {
      continue;
    }
    try {
      await fs.access(to);
      continue;
    } catch {
      // destination missing — move
    }
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.rename(from, to);
    console.log(`[data] Migrated ${from} → ${to}`);
  }

  try {
    const ops = path.join(root, "operations");
    const left = await fs.readdir(ops);
    if (left.length === 0) await fs.rmdir(ops);
  } catch {
    /* ignore */
  }

  await fs.writeFile(
    marker,
    JSON.stringify(
      {
        migratedAt: new Date().toISOString(),
        defaultOwner: owner,
      },
      null,
      2
    ),
    "utf8"
  );
}
