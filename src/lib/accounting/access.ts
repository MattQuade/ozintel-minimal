"use client";

export type AccountingUser = {
  name?: string;
  email: string;
  status: string;
  permissions?: {
    accounting?: boolean;
    pubOps?: boolean;
    forestryOps?: boolean;
  };
};

export type OpsPermission = "pubOps" | "forestryOps";

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  ms = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadCurrentUser(): Promise<AccountingUser | null> {
  // Prefer cookie-scoped /api/me — avoids downloading the full user list
  // and works even when localStorage is empty or stale.
  try {
    const res = await fetchWithTimeout("/api/me", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.user) {
        try {
          localStorage.setItem(
            "ozintel_current_user",
            JSON.stringify(data.user)
          );
        } catch {
          /* ignore quota / private mode */
        }
        return data.user as AccountingUser;
      }
    }
  } catch {
    // fall through to local cache
  }

  try {
    const stored = localStorage.getItem("ozintel_current_user");
    if (stored) {
      return JSON.parse(stored) as AccountingUser;
    }
  } catch {
    // ignore bad local storage
  }

  return null;
}

/** True when the restored/approved user has Accounting permission in Admin. */
export async function checkAccountingAccess(): Promise<boolean> {
  try {
    const found = await loadCurrentUser();
    if (!found) return false;
    return (
      found.status === "approved" && Boolean(found.permissions?.accounting)
    );
  } catch {
    return false;
  }
}

/** True when the restored/approved user has the given Ops permission in Admin. */
export async function checkOpsAccess(
  permission: OpsPermission
): Promise<boolean> {
  try {
    const found = await loadCurrentUser();
    if (!found) return false;
    return (
      found.status === "approved" && Boolean(found.permissions?.[permission])
    );
  } catch {
    return false;
  }
}
