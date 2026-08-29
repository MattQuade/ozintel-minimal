import { promises as fs } from "fs";
import {
  APPROVED_RECEIPT_MERCHANTS,
  type ApprovedMerchant,
} from "@/lib/accounting/approvedMerchants";
import {
  getAccountingDataDir,
  getMerchantsFilePath,
} from "@/lib/dataPaths";

function lettersOnly(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function splitTerms(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((t) => String(t || "").trim().toLowerCase())
      .filter(Boolean);
  }
  return String(raw || "")
    .split(/[|,;]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeMerchant(raw: unknown): ApprovedMerchant | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const label = String(row.label || row.name || row.shop || "").trim();
  const alias = lettersOnly(String(row.alias || row.code || label));
  if (!alias || !label) return null;
  const bankTerms = splitTerms(row.bankTerms || row.terms || label);
  const ocrKeys = splitTerms(row.ocrKeys || row.ocr || label);
  const alsoAliases = splitTerms(row.alsoAliases || row.aliases);
  return {
    alias,
    label,
    bankTerms: bankTerms.length ? bankTerms : [label.toLowerCase(), alias],
    ocrKeys: ocrKeys.length ? ocrKeys : [alias, lettersOnly(label)],
    ...(alsoAliases.length ? { alsoAliases } : {}),
  };
}

function parseCsv(text: string): unknown[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase();
  const hasHeader =
    header.includes("alias") ||
    header.includes("label") ||
    header.includes("name") ||
    header.includes("shop");
  const start = hasHeader ? 1 : 0;
  const cols = hasHeader
    ? lines[0].split(",").map((c) => c.trim().toLowerCase())
    : ["alias", "label", "bankTerms"];
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(start)) {
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length === 1 && parts[0]) {
      rows.push({ alias: lettersOnly(parts[0]), label: parts[0] });
      continue;
    }
    const row: Record<string, string> = {};
    cols.forEach((col, i) => {
      row[col] = parts[i] || "";
    });
    if (!row.alias && parts[0]) row.alias = parts[0];
    if (!row.label && parts[1]) row.label = parts[1];
    if (!row.label && row.alias) row.label = row.alias;
    rows.push(row);
  }
  return rows;
}

export function parseMerchantsUpload(text: string): ApprovedMerchant[] {
  const raw = String(text || "").trim();
  if (!raw) return [];
  let parsed: unknown = null;
  if (raw.startsWith("[") || raw.startsWith("{")) {
    parsed = JSON.parse(raw);
  } else {
    parsed = parseCsv(raw);
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { merchants?: unknown }).merchants)
      ? ((parsed as { merchants: unknown[] }).merchants)
      : [];
  const out: ApprovedMerchant[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const merchant = normalizeMerchant(item);
    if (!merchant || seen.has(merchant.alias)) continue;
    seen.add(merchant.alias);
    out.push(merchant);
  }
  return out;
}

export async function readMerchants(): Promise<ApprovedMerchant[]> {
  try {
    const raw = await fs.readFile(getMerchantsFilePath(), "utf8");
    const parsed = JSON.parse(raw || "[]");
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.merchants)
        ? parsed.merchants
        : [];
    const merchants = list
      .map((row: unknown) => normalizeMerchant(row))
      .filter((m: ApprovedMerchant | null): m is ApprovedMerchant => Boolean(m));
    return merchants;
  } catch {
    // missing or unreadable
  }
  return APPROVED_RECEIPT_MERCHANTS.map((m) => ({ ...m }));
}

export async function writeMerchants(
  merchants: ApprovedMerchant[]
): Promise<ApprovedMerchant[]> {
  const cleaned = merchants
    .map((row) => normalizeMerchant(row))
    .filter((m): m is ApprovedMerchant => Boolean(m));
  await fs.mkdir(getAccountingDataDir(), { recursive: true });
  await fs.writeFile(
    getMerchantsFilePath(),
    JSON.stringify(cleaned, null, 2),
    "utf8"
  );
  return cleaned;
}

export async function syncMerchantsFromDefaults(): Promise<ApprovedMerchant[]> {
  return writeMerchants(APPROVED_RECEIPT_MERCHANTS.map((m) => ({ ...m })));
}
