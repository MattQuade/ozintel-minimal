import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import {
  getReceiptFilesDir,
  getReceiptsDir,
  getReceiptsMetaFilePath,
} from "@/lib/dataPaths";
import { readLedger, updateLedgerEntry, type LedgerEntry } from "@/lib/accounting/store";
import { parseReceiptCaption } from "@/lib/accounting/receiptCaption";

export type ReceiptMeta = {
  id: string;
  originalFilename: string;
  mimeType: string;
  storedFileName: string;
  uploadedAt: string;
  sizeBytes: number;
  ledgerEntryIds: string[];
  /** Typed caption from in-app capture, e.g. ww 79.13 */
  caption?: string;
  captionAlias?: string;
  captionAmount?: number;
};

type ReceiptStore = {
  receipts: ReceiptMeta[];
};

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "application/pdf": ".pdf",
};

export function isAllowedReceiptMime(mimeType: string): boolean {
  const mime = (mimeType || "").toLowerCase().trim();
  if (ALLOWED_MIME.has(mime)) return true;
  if (mime.startsWith("image/")) return true;
  return false;
}

function normalizeMime(mimeType: string, filename: string): string {
  const mime = (mimeType || "").toLowerCase().trim();
  if (mime && mime !== "application/octet-stream") return mime;
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return mime || "application/octet-stream";
}

function extensionFor(mimeType: string, filename: string): string {
  const fromMime = EXT_BY_MIME[mimeType];
  if (fromMime) return fromMime;
  const ext = path.extname(filename || "").toLowerCase();
  if (ext && ext.length <= 8) return ext;
  if (mimeType.startsWith("image/")) return ".jpg";
  return ".bin";
}

async function ensureStore() {
  await fs.mkdir(getReceiptsDir(), { recursive: true });
  await fs.mkdir(getReceiptFilesDir(), { recursive: true });
  try {
    await fs.access(getReceiptsMetaFilePath());
  } catch {
    const initial: ReceiptStore = { receipts: [] };
    await fs.writeFile(
      getReceiptsMetaFilePath(),
      JSON.stringify(initial, null, 2),
      "utf8"
    );
  }
}

async function loadStore(): Promise<ReceiptStore> {
  await ensureStore();
  const raw = await fs.readFile(getReceiptsMetaFilePath(), "utf8");
  try {
    const parsed = JSON.parse(raw || '{"receipts":[]}');
    return {
      receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
    };
  } catch {
    return { receipts: [] };
  }
}

async function saveStore(store: ReceiptStore) {
  await ensureStore();
  const target = getReceiptsMetaFilePath();
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(store, null, 2);
  await fs.writeFile(tmp, payload, "utf8");
  try {
    await fs.rename(tmp, target);
  } catch {
    await fs.copyFile(tmp, target);
    await fs.unlink(tmp).catch(() => undefined);
  }
}

export function receiptPublicUrl(id: string): string {
  return `/api/ledger/receipts/${encodeURIComponent(id)}`;
}

export async function createReceipt(args: {
  buffer: Buffer;
  mimeType: string;
  originalFilename: string;
  ledgerEntryIds?: string[];
  caption?: string;
}): Promise<ReceiptMeta> {
  const originalFilename = String(args.originalFilename || "receipt").trim() || "receipt";
  const mimeType = normalizeMime(args.mimeType, originalFilename);
  if (!isAllowedReceiptMime(mimeType)) {
    throw new Error("Unsupported file type. Use JPEG, PNG, WebP, HEIC, or PDF.");
  }
  if (!args.buffer?.length) {
    throw new Error("Empty file");
  }
  // Soft cap ~18MB (client compresses phone photos; PDFs stay as-is)
  if (args.buffer.length > 18 * 1024 * 1024) {
    throw new Error("File too large (max 18MB)");
  }

  const parsedCaption = parseReceiptCaption(String(args.caption || ""));
  const caption = String(args.caption || "").trim();
  if (caption && !parsedCaption) {
    throw new Error('Caption must look like "ww 79.13" (merchant + amount).');
  }

  const store = await loadStore();
  const id = crypto.randomUUID();
  const ext = extensionFor(mimeType, originalFilename);
  const storedFileName = `${id}${ext}`;
  const filePath = path.join(getReceiptFilesDir(), storedFileName);
  await fs.writeFile(filePath, args.buffer);

  const ledgerEntryIds = (args.ledgerEntryIds || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  const meta: ReceiptMeta = {
    id,
    originalFilename,
    mimeType,
    storedFileName,
    uploadedAt: new Date().toISOString(),
    sizeBytes: args.buffer.length,
    ledgerEntryIds,
    ...(parsedCaption
      ? {
          caption: parsedCaption.display,
          captionAlias: parsedCaption.alias,
          captionAmount: parsedCaption.amount,
        }
      : {}),
  };

  store.receipts.unshift(meta);
  await saveStore(store);

  for (const entryId of ledgerEntryIds) {
    await addReceiptIdToLedgerEntry(id, entryId);
  }

  return meta;
}

/** Update receipt metadata so it knows about a ledger entry (does not touch ledger.json). */
export async function registerLedgerEntryOnReceipts(
  receiptIds: string[],
  ledgerEntryId: string
) {
  const entryId = String(ledgerEntryId || "").trim();
  const ids = (receiptIds || []).map((x) => String(x || "").trim()).filter(Boolean);
  if (!entryId || ids.length === 0) return;

  const store = await loadStore();
  let changed = false;
  for (const receiptId of ids) {
    const idx = store.receipts.findIndex((r) => r.id === receiptId);
    if (idx < 0) continue;
    if (store.receipts[idx].ledgerEntryIds.includes(entryId)) continue;
    store.receipts[idx] = {
      ...store.receipts[idx],
      ledgerEntryIds: [...store.receipts[idx].ledgerEntryIds, entryId],
    };
    changed = true;
  }
  if (changed) await saveStore(store);
}

async function addReceiptIdToLedgerEntry(receiptId: string, ledgerEntryId: string) {
  const ledger = await readLedger();
  const entry = ledger.find((e) => e.id === ledgerEntryId);
  if (!entry) return;
  const existing = Array.isArray(entry.receiptIds) ? entry.receiptIds : [];
  if (existing.includes(receiptId)) return;
  await updateLedgerEntry({
    id: ledgerEntryId,
    receiptIds: [...existing, receiptId],
  });
}

export async function getReceiptMeta(id: string): Promise<ReceiptMeta | null> {
  const store = await loadStore();
  return store.receipts.find((r) => r.id === id) || null;
}

export async function getReceiptFile(id: string): Promise<{
  meta: ReceiptMeta;
  filePath: string;
}> {
  const meta = await getReceiptMeta(id);
  if (!meta) throw new Error("Receipt not found");
  const filePath = path.join(getReceiptFilesDir(), meta.storedFileName);
  await fs.access(filePath);
  return { meta, filePath };
}

export async function listReceiptsByLedgerEntry(
  ledgerEntryId: string
): Promise<ReceiptMeta[]> {
  const id = String(ledgerEntryId || "").trim();
  if (!id) return [];
  const store = await loadStore();
  return store.receipts.filter((r) => r.ledgerEntryIds.includes(id));
}

/** Newest-first list of every stored receipt (inbox + linked). */
export async function listAllReceipts(): Promise<ReceiptMeta[]> {
  const store = await loadStore();
  return [...store.receipts].sort((a, b) => {
    const ta = Date.parse(a.uploadedAt || "") || 0;
    const tb = Date.parse(b.uploadedAt || "") || 0;
    return tb - ta;
  });
}

/** In-app photos waiting for a bank CSV line (captioned, not yet linked). */
export async function listUnmatchedCaptionedReceipts(): Promise<ReceiptMeta[]> {
  const store = await loadStore();
  return store.receipts.filter((r) => {
    const linked = Array.isArray(r.ledgerEntryIds) ? r.ledgerEntryIds : [];
    if (linked.length > 0) return false;
    if (r.captionAlias && Number(r.captionAmount) > 0) return true;
    return Boolean(parseReceiptCaption(String(r.caption || "")));
  });
}

export async function listInboxReceipts(): Promise<ReceiptMeta[]> {
  const store = await loadStore();
  return store.receipts.filter((r) => {
    const linked = Array.isArray(r.ledgerEntryIds) ? r.ledgerEntryIds : [];
    return linked.length === 0;
  });
}

export async function attachReceiptToEntry(
  receiptId: string,
  ledgerEntryId: string
): Promise<ReceiptMeta> {
  await registerLedgerEntryOnReceipts([receiptId], ledgerEntryId);
  await addReceiptIdToLedgerEntry(receiptId, ledgerEntryId);
  const meta = await getReceiptMeta(receiptId);
  if (!meta) throw new Error("Receipt not found");
  return meta;
}

export async function deleteReceipt(id: string): Promise<boolean> {
  const store = await loadStore();
  const idx = store.receipts.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  const meta = store.receipts[idx];
  store.receipts.splice(idx, 1);
  await saveStore(store);

  const filePath = path.join(getReceiptFilesDir(), meta.storedFileName);
  await fs.unlink(filePath).catch(() => undefined);

  // Strip id from linked ledger entries (one pass)
  const ledger = await readLedger();
  for (const entry of ledger) {
    const ids = Array.isArray(entry.receiptIds) ? entry.receiptIds : [];
    if (!ids.includes(id)) continue;
    await updateLedgerEntry({
      id: entry.id,
      receiptIds: ids.filter((x) => x !== id),
    });
  }

  return true;
}

export function receiptIdsOf(entry: Pick<LedgerEntry, "receiptIds"> | null | undefined): string[] {
  return Array.isArray(entry?.receiptIds)
    ? entry!.receiptIds!.filter((x) => typeof x === "string" && x.trim())
    : [];
}
