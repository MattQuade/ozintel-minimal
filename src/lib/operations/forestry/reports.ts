import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import {
  getDataDir,
  getForestryDataDir,
  getForestryPhotosDir,
  getForestryReportsFilePath,
  getLegacyForestryDataDir,
} from "@/lib/dataPaths";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { ensureOwnerSiloMigration } from "@/lib/migrateOwnerSilos";

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

async function listOwnerEmailsOnDisk(): Promise<string[]> {
  const ownersRoot = path.join(getDataDir(), "owners");
  try {
    const entries = await fs.readdir(ownersRoot, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function loadStoreAtReportsPath(
  reportsPath: string
): Promise<ForestryReportStore | null> {
  try {
    const raw = await fs.readFile(reportsPath, "utf8");
    const parsed = JSON.parse(raw || '{"reports":[]}');
    return {
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
    };
  } catch {
    return null;
  }
}

/**
 * Client share links are not cookie-authenticated — search every owner silo
 * (plus legacy path) for the report id + access code.
 */
async function findReportAcrossOwners(
  id: string,
  accessCode: string
): Promise<{ report: ForestryReport; photoPath: string }> {
  await ensureOwnerSiloMigration();
  const codeHash = hashAccessCode(accessCode.trim());

  const owners = await listOwnerEmailsOnDisk();
  for (const owner of owners) {
    const found = await runWithDataOwnerAsync(owner, async () => {
      const store = await loadStoreAtReportsPath(getForestryReportsFilePath());
      if (!store) return null;
      const report = store.reports.find((item) => item.id === id);
      if (!report) return null;
      if (report.accessCodeHash !== codeHash) {
        throw new Error("Invalid access code");
      }
      return {
        report,
        photoPath: path.join(getForestryPhotosDir(), report.photoFileName),
      };
    });
    if (found) return found;
  }

  // Legacy pre-migration path
  const legacyStore = await loadStoreAtReportsPath(
    path.join(getLegacyForestryDataDir(), "reports.json")
  );
  if (legacyStore) {
    const report = legacyStore.reports.find((item) => item.id === id);
    if (report) {
      if (report.accessCodeHash !== codeHash) {
        throw new Error("Invalid access code");
      }
      return {
        report,
        photoPath: path.join(
          getLegacyForestryDataDir(),
          "photos",
          report.photoFileName
        ),
      };
    }
  }

  throw new Error("Report not found");
}

export async function verifyForestryReportAccess(
  id: string,
  accessCode: string
) {
  const { report } = await findReportAcrossOwners(id, accessCode);
  return publicReport(report);
}

export async function getForestryPhotoForAccess(id: string, accessCode: string) {
  return findReportAcrossOwners(id, accessCode);
}
