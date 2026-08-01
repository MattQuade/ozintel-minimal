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

function emailsMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function loadCurrentUser(): Promise<AccountingUser | null> {
  let email = "";
  try {
    const stored = localStorage.getItem("ozintel_current_user");
    if (stored) {
      const local = JSON.parse(stored) as AccountingUser;
      email = local.email || "";
    }
  } catch {
    // ignore bad local storage
  }

  if (!email && typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|; )ozintel_user_email=([^;]+)/);
    if (match) email = decodeURIComponent(match[1]);
  }

  if (!email) return null;

  const res = await fetch("/api/users");
  const data = await res.json();
  if (!data.success || !Array.isArray(data.users)) return null;

  const found = data.users.find((u: AccountingUser) =>
    emailsMatch(u.email, email)
  );
  if (!found) return null;

  localStorage.setItem("ozintel_current_user", JSON.stringify(found));
  return found;
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
