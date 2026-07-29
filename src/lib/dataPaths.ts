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
