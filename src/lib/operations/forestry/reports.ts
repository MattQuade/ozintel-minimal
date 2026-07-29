import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import {
  getForestryDataDir,
  getForestryPhotosDir,
  getForestryReportsFilePath,
} from "@/lib/dataPaths";

export type ForestryReport = {
  id: string;
  clientName: string;
  notes: string;
  createdAt: string;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  photoFileName: string;
  photoMimeType: string;
  accessCodeHash: string;
};

type ForestryReportStore = {
  reports: ForestryReport[];
};

export type ForestryReportPublic = Omit<ForestryReport, "accessCodeHash">;

function hashAccessCode(accessCode: string) {
  return crypto.createHash("sha256").update(accessCode).digest("hex");
}

function publicReport(report: ForestryReport): ForestryReportPublic {
  const { accessCodeHash: _accessCodeHash, ...rest } = report;
  return rest;
}

async function ensureStore() {
  await fs.mkdir(getForestryDataDir(), { recursive: true });
  await fs.mkdir(getForestryPhotosDir(), { recursive: true });
  try {
    await fs.access(getForestryReportsFilePath());
  } catch {
    const initial: ForestryReportStore = { reports: [] };
    await fs.writeFile(
      getForestryReportsFilePath(),
      JSON.stringify(initial, null, 2),
      "utf8"
    );
  }
}

async function loadStore(): Promise<ForestryReportStore> {
  await ensureStore();
  const raw = await fs.readFile(getForestryReportsFilePath(), "utf8");
  const parsed = JSON.parse(raw || '{"reports":[]}');
  return {
    reports: Array.isArray(parsed.reports) ? parsed.reports : [],
  };
}

async function saveStore(store: ForestryReportStore) {
  await ensureStore();
  await fs.writeFile(
    getForestryReportsFilePath(),
    JSON.stringify(store, null, 2),
    "utf8"
  );
}

function safeExtensionFromMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/heic") return ".heic";
  return ".jpg";
}

export async function createForestryReport(args: {
  clientName: string;
  notes: string;
  accessCode: string;
  photoBuffer: Buffer;
  photoMimeType: string;
  latitude: number | null;
  longitude: number | null;
  capturedAt?: string;
}) {
  const store = await loadStore();
  const id = crypto.randomUUID();
  const ext = safeExtensionFromMimeType(args.photoMimeType);
  const photoFileName = `${id}${ext}`;
  const photoPath = path.join(getForestryPhotosDir(), photoFileName);
  await fs.writeFile(photoPath, args.photoBuffer);

  const report: ForestryReport = {
    id,
    clientName: args.clientName.trim(),
    notes: args.notes.trim(),
    createdAt: new Date().toISOString(),
    capturedAt: args.capturedAt?.trim() || new Date().toISOString(),
    latitude: args.latitude,
    longitude: args.longitude,
    photoFileName,
    photoMimeType: args.photoMimeType,
    accessCodeHash: hashAccessCode(args.accessCode.trim()),
  };

  store.reports.unshift(report);
  await saveStore(store);
  return publicReport(report);
}

export async function listForestryReports() {
  const store = await loadStore();
  return store.reports.map(publicReport);
}

export async function verifyForestryReportAccess(id: string, accessCode: string) {
  const store = await loadStore();
  const report = store.reports.find((item) => item.id === id);
  if (!report) {
    throw new Error("Report not found");
  }
  if (report.accessCodeHash !== hashAccessCode(accessCode.trim())) {
    throw new Error("Invalid access code");
  }
  return publicReport(report);
}

export async function getForestryPhotoForAccess(id: string, accessCode: string) {
  const store = await loadStore();
  const report = store.reports.find((item) => item.id === id);
  if (!report) {
    throw new Error("Report not found");
  }
  if (report.accessCodeHash !== hashAccessCode(accessCode.trim())) {
    throw new Error("Invalid access code");
  }
  const photoPath = path.join(getForestryPhotosDir(), report.photoFileName);
  return {
    report,
    photoPath,
  };
}
