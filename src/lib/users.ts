import { promises as fs } from "fs";
import {
  getDataDir,
  getRepoSeedUsersPath,
  getUsersFilePath,
} from "@/lib/dataPaths";
export type UserStatus = "pending" | "approved" | "blocked";
export type UserPermissions = {
  accounting: boolean;
  pubOps: boolean;
  forestryOps: boolean;
};
export type LastAlert = {
  at: string;
  lat: number | null;
  lng: number | null;
  alertType?: string;
};
export type User = {
  name: string;
  email: string;
  phone: string;
  status: UserStatus;
  smsCount: number;
  smsMonth: string;
  permissions: UserPermissions;
  lastAlert?: LastAlert | null;
};
function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function normalizeUser(raw: Partial<User> & { email: string }): User {
  const month = currentMonthKey();
  const smsMonth = raw.smsMonth || month;
  const smsCount =
    smsMonth === month ? Number(raw.smsCount || 0) : 0;
  const permissionsRaw = raw.permissions;
  let permissions: UserPermissions = {
    accounting: false,
    pubOps: false,
    forestryOps: false,
  };
  if (Array.isArray(permissionsRaw)) {
    permissions = {
      accounting: permissionsRaw.includes("accounting"),
      pubOps:
        permissionsRaw.includes("pub") || permissionsRaw.includes("pubOps"),
      forestryOps:
        permissionsRaw.includes("forestry") ||
        permissionsRaw.includes("forestryOps"),
    };
  } else if (permissionsRaw && typeof permissionsRaw === "object") {
    permissions = {
      accounting: Boolean((permissionsRaw as UserPermissions).accounting),
      pubOps: Boolean((permissionsRaw as UserPermissions).pubOps),
      forestryOps: Boolean((permissionsRaw as UserPermissions).forestryOps),
    };
  }
  return {
    name: raw.name || "Unknown",
    email: String(raw.email).trim(),
    phone: raw.phone || "No phone yet",
    status: (raw.status as UserStatus) || "pending",
    smsCount,
    smsMonth: month,
    permissions,
    lastAlert: raw.lastAlert ?? null,
  };
}
export function publicUser(user: User) {
  return {
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    smsCount: user.smsCount,
    permissions: user.permissions,
  };
}
function extractUsersArray(parsed: unknown): {
  users: Array<Partial<User> & { email: string }>;
  wasLegacyArray: boolean;
} {
  if (Array.isArray(parsed)) {
    return {
      users: parsed.filter(
        (u): u is Partial<User> & { email: string } =>
          Boolean(u && typeof u === "object" && "email" in u)
      ),
      wasLegacyArray: true,
    };
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { users?: unknown }).users)
  ) {
    return {
      users: (parsed as { users: Array<Partial<User> & { email: string }> })
        .users,
      wasLegacyArray: false,
    };
  }
  return { users: [], wasLegacyArray: false };
}
/** Copy repo `data/users.json` onto persistent disk once (first deploy with disk). */
async function maybeSeedFromRepo(force = false) {
  const usersFile = getUsersFilePath();
  if (!force) {
    try {
      await fs.access(usersFile);
      return false;
    } catch {
      // no file on persistent storage yet
    }
  } else {
    try {
      const raw = await fs.readFile(usersFile, "utf8");
      const { users } = extractUsersArray(JSON.parse(raw || '{"users":[]}'));
      if (users.length > 0) return false;
    } catch {
      // file missing — seed below
    }
  }
  if (!process.env.OZINTEL_DATA_DIR?.trim()) return false;
  try {
    const seedPath = getRepoSeedUsersPath();
    const seedRaw = await fs.readFile(seedPath, "utf8");
    const parsed = JSON.parse(seedRaw || '{"users":[]}');
    const { users } = extractUsersArray(parsed);
    if (users.length === 0) return false;
    await fs.mkdir(getDataDir(), { recursive: true });
    await fs.writeFile(usersFile, JSON.stringify({ users }, null, 2), "utf8");
    console.log(
      `[users] Seeded ${users.length} user(s) from repo data/ onto persistent disk`
    );
    return true;
  } catch {
    return false;
  }
}
async function ensureStore() {
  const dataDir = getDataDir();
  const usersFile = getUsersFilePath();
  await fs.mkdir(dataDir, { recursive: true });
  await maybeSeedFromRepo();
  try {
    await fs.access(usersFile);
  } catch {
    await fs.writeFile(
      usersFile,
      JSON.stringify({ users: [] }, null, 2),
      "utf8"
    );
  }
}
export async function readUsers(): Promise<User[]> {
  await ensureStore();
  await maybeSeedFromRepo(true);
  const usersFile = getUsersFilePath();
  const raw = await fs.readFile(usersFile, "utf8");
  const parsed = JSON.parse(raw || '{"users":[]}');
  const { users, wasLegacyArray } = extractUsersArray(parsed);
  const month = currentMonthKey();
  let changed = wasLegacyArray;
  const normalized = users.map((u: Partial<User> & { email: string }) => {
    const next = normalizeUser(u);
    if (u.smsMonth !== month || Number(u.smsCount || 0) !== next.smsCount) {
      changed = true;
    }
    return next;
  });
  if (changed) await writeUsers(normalized);
  return normalized;
}
export async function writeUsers(users: User[]) {
  await ensureStore();
  await fs.writeFile(
    getUsersFilePath(),
    JSON.stringify({ users }, null, 2),
    "utf8"
  );
}
export async function findUserByEmail(email: string) {
  const users = await readUsers();
  return (
    users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null
  );
}
export { currentMonthKey };


