import { AsyncLocalStorage } from "async_hooks";

export type DataOwnerStore = {
  /** Normalized (lowercase) owner email for module JSON paths. */
  email: string;
};

const storage = new AsyncLocalStorage<DataOwnerStore>();

export function normalizeOwnerEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

export function getDataOwnerEmail(): string | null {
  const email = storage.getStore()?.email;
  return email ? normalizeOwnerEmail(email) : null;
}

/** Run module I/O against a specific owner's siloed data directories. */
export function runWithDataOwner<T>(
  ownerEmail: string,
  fn: () => T
): T {
  const email = normalizeOwnerEmail(ownerEmail);
  if (!email) {
    throw new Error("Data owner email is required");
  }
  return storage.run({ email }, fn);
}

export async function runWithDataOwnerAsync<T>(
  ownerEmail: string,
  fn: () => Promise<T>
): Promise<T> {
  const email = normalizeOwnerEmail(ownerEmail);
  if (!email) {
    throw new Error("Data owner email is required");
  }
  return storage.run({ email }, fn);
}
