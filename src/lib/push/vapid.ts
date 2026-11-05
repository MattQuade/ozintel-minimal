import { promises as fs } from "fs";
import path from "path";
import webpush from "web-push";
import { getDataDir } from "@/lib/dataPaths";

type VapidStore = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

function vapidFilePath() {
  return path.join(getDataDir(), "vapid.json");
}

async function readEnvKeys(): Promise<VapidStore | null> {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject:
      process.env.VAPID_SUBJECT?.trim() || "mailto:admin@ozintel.com.au",
  };
}

async function readOrCreateVolumeKeys(): Promise<VapidStore> {
  const file = vapidFilePath();
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<VapidStore>;
    if (parsed.publicKey && parsed.privateKey) {
      return {
        publicKey: parsed.publicKey,
        privateKey: parsed.privateKey,
        subject: parsed.subject || "mailto:admin@ozintel.com.au",
      };
    }
  } catch {
    // create below
  }

  const generated = webpush.generateVAPIDKeys();
  const store: VapidStore = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject: "mailto:admin@ozintel.com.au",
  };
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.writeFile(file, JSON.stringify(store, null, 2), "utf8");
  console.log("[push] Generated VAPID keys onto data volume");
  return store;
}

let cached: VapidStore | null = null;

export async function getVapidKeys(): Promise<VapidStore> {
  if (cached) return cached;
  cached = (await readEnvKeys()) || (await readOrCreateVolumeKeys());
  return cached;
}

export async function getVapidPublicKey(): Promise<string> {
  const keys = await getVapidKeys();
  return keys.publicKey;
}

export async function configureWebPush(): Promise<VapidStore> {
  const keys = await getVapidKeys();
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  return keys;
}
