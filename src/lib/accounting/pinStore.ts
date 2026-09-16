import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { getDataDir } from "@/lib/dataPaths";

type PinRecord = { salt: string; hash: string };
type PinMap = Record<string, PinRecord>;

function pinFilePath() {
  return path.join(getDataDir(), "accounting-pins.json");
}

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function hashPin(pin: string, email: string, salt: string) {
  return crypto
    .scryptSync(`${pin}:${normalizeEmail(email)}`, salt, 32)
    .toString("hex");
}

export function isFourDigitPin(pin: string) {
  return /^\d{4}$/.test(pin);
}

async function readPinMap(): Promise<PinMap> {
  try {
    const raw = await fs.readFile(pinFilePath(), "utf8");
    const parsed = JSON.parse(raw || "{}") as PinMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writePinMap(map: PinMap) {
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.writeFile(pinFilePath(), JSON.stringify(map, null, 2), "utf8");
}

export async function hasAccountingPin(email: string) {
  const map = await readPinMap();
  return Boolean(map[normalizeEmail(email)]?.hash);
}

export async function setAccountingPin(email: string, pin: string) {
  if (!isFourDigitPin(pin)) {
    throw new Error("PIN must be 4 digits.");
  }
  const key = normalizeEmail(email);
  const map = await readPinMap();
  if (map[key]?.hash) {
    throw new Error("PIN is already set. Enter it to unlock.");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  map[key] = { salt, hash: hashPin(pin, key, salt) };
  await writePinMap(map);
}

export async function verifyAccountingPin(email: string, pin: string) {
  if (!isFourDigitPin(pin)) return false;
  const key = normalizeEmail(email);
  const rec = (await readPinMap())[key];
  if (!rec?.hash || !rec.salt) return false;
  const next = hashPin(pin, key, rec.salt);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(rec.hash, "hex"),
      Buffer.from(next, "hex")
    );
  } catch {
    return false;
  }
}
