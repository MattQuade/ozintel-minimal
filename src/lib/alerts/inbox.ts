import { promises as fs } from "fs";
import path from "path";
import { getDataDir } from "@/lib/dataPaths";

export type InAppAlert = {
  id: string;
  at: string;
  fromName: string;
  fromEmail: string;
  kind: "SAFE ARRIVAL" | "EMERGENCY";
  body: string;
};

const KEEP = 20;

function inboxPath(email: string): string {
  const safe = String(email || "")
    .trim()
    .toLowerCase()
    .replace(/[/\\]/g, "_");
  return path.join(getDataDir(), "alert-inbox", `${safe}.json`);
}

async function readList(email: string): Promise<InAppAlert[]> {
  try {
    const raw = await fs.readFile(inboxPath(email), "utf8");
    const parsed = JSON.parse(raw) as { messages?: InAppAlert[] };
    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

/** One file for this login. Newest first. */
export async function listInAppAlerts(email: string): Promise<InAppAlert[]> {
  const messages = await readList(email);
  return messages.slice(0, KEEP);
}

/** Save one alert for one login. Does not text anyone. */
export async function addInAppAlert(
  email: string,
  alert: InAppAlert
): Promise<void> {
  const to = String(email || "").trim().toLowerCase();
  if (!to) return;
  const messages = [alert, ...(await readList(to))].slice(0, KEEP);
  const file = inboxPath(to);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ messages }), "utf8");
}
