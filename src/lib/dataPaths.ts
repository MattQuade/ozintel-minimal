import path from "path";

/**
 * Where user JSON and future module data are stored.
 *
 * Local dev: defaults to `<project>/data`
 * Render persistent disk: set OZINTEL_DATA_DIR=/var/data (or your mount path)
 */
export function getDataDir(): string {
  const configured = process.env.OZINTEL_DATA_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(process.cwd(), "data");
}

export function getUsersFilePath(): string {
  return path.join(getDataDir(), "users.json");
}

/** Repo-bundled seed file (used once when persistent disk is empty). */
export function getRepoSeedUsersPath(): string {
  return path.join(process.cwd(), "data", "users.json");
}

/** Pub Operations data folder (kegs, etc.) — separate from alerts/accounting. */
export function getPubOpsDataDir(): string {
  return path.join(getDataDir(), "operations", "pub");
}

export function getKegsFilePath(): string {
  return path.join(getPubOpsDataDir(), "kegs.json");
}

/** Closed monthly keg ledgers (read-only after archive). */
export function getKegsArchiveDir(): string {
  return path.join(getPubOpsDataDir(), "archives");
}

export function getKegsArchiveFilePath(month: string): string {
  return path.join(getKegsArchiveDir(), `kegs-${month}.json`);
}

/** Forestry Operations data folder (reports/photos) on persistent disk. */
export function getForestryDataDir(): string {
  return path.join(getDataDir(), "operations", "forestry");
}

export function getForestryReportsFilePath(): string {
  return path.join(getForestryDataDir(), "reports.json");
}

export function getForestryPhotosDir(): string {
  return path.join(getForestryDataDir(), "photos");
}

/**
 * Accounting data folder — separate from pub ops / forestry / alerts users.
 * Lives on OZINTEL_DATA_DIR when set (Render disk).
 */
export function getAccountingDataDir(): string {
  return path.join(getDataDir(), "accounting");
}

export function getLedgerFilePath(): string {
  return path.join(getAccountingDataDir(), "ledger.json");
}

export function getCoaFilePath(): string {
  return path.join(getAccountingDataDir(), "coa.json");
}

export function getAccountingRulesFilePath(): string {
  return path.join(getAccountingDataDir(), "rules.json");
}

export function getBankAccountsFilePath(): string {
  return path.join(getAccountingDataDir(), "bank-accounts.json");
}

/** Receipt evidence files + metadata (ATO-justifiable expense attachments). */
export function getReceiptsDir(): string {
  return path.join(getAccountingDataDir(), "receipts");
}

export function getReceiptsMetaFilePath(): string {
  return path.join(getReceiptsDir(), "receipts.json");
}

export function getReceiptFilesDir(): string {
  return path.join(getReceiptsDir(), "files");
}

/** Repo seeds used once when persistent accounting files are missing. */
export function getRepoSeedLedgerPath(): string {
  return path.join(process.cwd(), "data", "ledger.json");
}

export function getRepoSeedCoaPath(): string {
  return path.join(process.cwd(), "data", "coa.json");
}

export function getRepoSeedRulesPath(): string {
  return path.join(process.cwd(), "src", "core", "rules", "rules.json");
}

export function getRepoSeedBankAccountsPath(): string {
  return path.join(process.cwd(), "data", "bank-accounts.json");
}
