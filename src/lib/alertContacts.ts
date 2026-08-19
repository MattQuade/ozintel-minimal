import { promises as fs } from "fs";
import path from "path";
import { getDataDir } from "@/lib/dataPaths";

export type AlertContact = {
  name: string;
  phone: string;
};

export type AlertContactsFile = {
  safe: AlertContact[];
  emergency: AlertContact[];
};

function contactsDir(): string {
  return path.join(getDataDir(), "alert-contacts");
}

function safeEmailSegment(email: string): string {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/[/\\]/g, "_");
}

export function getAlertContactsPath(email: string): string {
  return path.join(contactsDir(), `${safeEmailSegment(email)}.json`);
}

export async function readAlertContacts(
  email: string
): Promise<AlertContactsFile> {
  const empty: AlertContactsFile = { safe: [], emergency: [] };
  if (!email?.trim()) return empty;
  try {
    const raw = await fs.readFile(getAlertContactsPath(email), "utf8");
    const parsed = JSON.parse(raw) as Partial<AlertContactsFile>;
    return {
      safe: Array.isArray(parsed.safe)
        ? parsed.safe
            .map((c) => ({
              name: String(c?.name || "").trim(),
              phone: String(c?.phone || "").trim(),
            }))
            .filter((c) => c.name && c.phone)
        : [],
      emergency: Array.isArray(parsed.emergency)
        ? parsed.emergency
            .map((c) => ({
              name: String(c?.name || "").trim(),
              phone: String(c?.phone || "").trim(),
            }))
            .filter((c) => c.name && c.phone)
        : [],
    };
  } catch {
    return empty;
  }
}

export async function writeAlertContacts(
  email: string,
  data: AlertContactsFile
): Promise<void> {
  const dir = contactsDir();
  await fs.mkdir(dir, { recursive: true });
  const normalized: AlertContactsFile = {
    safe: (data.safe || [])
      .map((c) => ({
        name: String(c.name || "").trim(),
        phone: String(c.phone || "").trim(),
      }))
      .filter((c) => c.name && c.phone),
    emergency: (data.emergency || [])
      .map((c) => ({
        name: String(c.name || "").trim(),
        phone: String(c.phone || "").trim(),
      }))
      .filter((c) => c.name && c.phone),
  };
  await fs.writeFile(
    getAlertContactsPath(email),
    JSON.stringify(normalized, null, 2),
    "utf8"
  );
}
