/**
 * Parse a Xero Assets xlsx (or CSV) into row objects.
 * Mapping to OzIntel CoA is by asset type — not by any one client's numbers.
 */

import { inflateRawSync } from "zlib";
import { toIsoDateInput, parseFlexibleDate } from "@/lib/accounting/dates";
import {
  parseAveragingMethod,
  parseBookMethod,
  type AveragingMethod,
  type BookMethod,
} from "@/lib/accounting/depreciation";

export type AssetTypeKey =
  | "plant"
  | "vehicles"
  | "property_improvements"
  | "fixtures";

export type AssetTypeAccounts = {
  label: string;
  assetCode: string;
  accumCode: string;
  expenseCode: string;
};

/** Product CoA links — codes only, no live balances. */
export const ASSET_TYPE_COA: Record<AssetTypeKey, AssetTypeAccounts> = {
  plant: {
    label: "Plant & Equipment",
    assetCode: "2860",
    accumCode: "2869",
    expenseCode: "1318",
  },
  vehicles: {
    label: "Motor Vehicles",
    assetCode: "2890",
    accumCode: "2895",
    expenseCode: "1318",
  },
  property_improvements: {
    label: "Property Improvements",
    assetCode: "2840",
    accumCode: "2841",
    expenseCode: "1318",
  },
  fixtures: {
    label: "Fixtures & Fittings",
    assetCode: "2831",
    accumCode: "2834",
    expenseCode: "1318",
  },
};

export const ASSET_TYPE_OPTIONS = Object.values(ASSET_TYPE_COA).map((t) => t.label);

export function accountsForAssetType(typeName: string): AssetTypeAccounts {
  const key = classifyAssetType(typeName);
  return ASSET_TYPE_COA[key];
}

export function classifyAssetType(typeName: string): AssetTypeKey {
  const s = String(typeName || "").toLowerCase();
  if (s.includes("vehicle") || s.includes("motor")) return "vehicles";
  if (s.includes("property") || s.includes("improvement") || s.includes("building")) {
    return "property_improvements";
  }
  if (s.includes("fixture") || s.includes("fitting") || s.includes("furniture")) {
    return "fixtures";
  }
  return "plant";
}

export type XeroAssetRow = {
  assetName: string;
  assetNumber: string;
  assetStatus: string;
  purchaseDate: string;
  purchasePrice: number;
  assetType: string;
  description: string;
  serialNumber: string;
  bookDepreciationStartDate: string;
  bookCostLimit: number | null;
  bookResidualValue: number;
  bookDepreciationMethod: BookMethod;
  bookAveragingMethod: AveragingMethod;
  bookRate: number;
  bookEffectiveLife: number | null;
  bookOpeningAccumulatedDep: number;
  bookValue: number;
  accumulatedDepreciation: number;
  taxDepreciationMethod: BookMethod | null;
  taxAveragingMethod: AveragingMethod | null;
  taxRate: number | null;
  taxOpeningAccumulatedDep: number | null;
  taxValue: number | null;
  taxAccumulatedDepreciation: number | null;
  depreciationToDate: string;
  disposalDate: string;
};

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_DIR = 0x02014b50;

function unzip(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig === CENTRAL_DIR) break;
    if (sig !== LOCAL_HEADER) break;
    const flags = buf.readUInt16LE(offset + 6);
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    if (flags & 0x08) {
      throw new Error("XLSX uses ZIP data descriptors; cannot parse this file");
    }
    const nameStart = offset + 30;
    const name = buf.toString("utf8", nameStart, nameStart + nameLen);
    const dataStart = nameStart + nameLen + extraLen;
    const compressed = buf.subarray(dataStart, dataStart + compSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error(`Unsupported ZIP method ${method} in xlsx`);
    files.set(name.replace(/\\/g, "/"), data);
    offset = dataStart + compSize;
  }
  return files;
}

function decodeXml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    );
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const texts = [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)];
    out.push(decodeXml(texts.map((t) => t[1]).join("")));
  }
  return out;
}

function colIndex(ref: string): number {
  const letters = (ref.match(/^[A-Z]+/i) || ["A"])[0].toUpperCase();
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n - 1;
}

function excelSerialToIso(serial: number): string {
  const epoch = Date.UTC(1899, 11, 30);
  const d = new Date(epoch + Math.round(serial) * 86400000);
  return d.toISOString().slice(0, 10);
}

function parseSheetRows(xml: string, strings: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) {
      const attrs = cellMatch[1] || cellMatch[3] || "";
      const inner = cellMatch[2] || "";
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/i) || [])[1] || "";
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
      let value = "";
      if (type === "inlineStr") {
        const t = inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        value = t ? decodeXml(t[1]) : "";
      } else {
        const v = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        value = v ? decodeXml(v[1]) : "";
        if (type === "s") {
          const idx = Number(value);
          value = Number.isFinite(idx) ? strings[idx] || "" : "";
        }
      }
      if (ref) cells[colIndex(ref)] = value;
    }
    rows.push(cells.map((c) => (c == null ? "" : c)));
  }
  return rows;
}

function firstSheetPath(files: Map<string, Buffer>): string {
  const wb = files.get("xl/workbook.xml")?.toString("utf8") || "";
  const sheet = wb.match(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/);
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") || "";
  if (sheet) {
    const rid = sheet[2];
    const rel = rels.match(
      new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`)
    ) || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`));
    if (rel) {
      const target = rel[1].replace(/^\/?xl\//, "");
      const path = target.startsWith("xl/") ? target : `xl/${target}`;
      if (files.has(path)) return path;
    }
  }
  for (const name of files.keys()) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) return name;
  }
  throw new Error("No worksheet found in xlsx");
}

function asNumber(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw).replace(/[$,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function asOptionalNumber(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = asNumber(raw);
  return n === 0 && String(raw).trim() === "" ? null : n;
}

function asIsoDate(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number" && raw > 20000 && raw < 80000) {
    return excelSerialToIso(raw);
  }
  const s = String(raw).trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) return excelSerialToIso(n);
  }
  return toIsoDateInput(parseFlexibleDate(s) || s) || "";
}

function headerKey(h: string): string {
  return String(h || "")
    .replace(/^\*/, "")
    .replace(/[\s_]+/g, "")
    .toLowerCase();
}

const FIELD_ALIASES: Record<keyof XeroAssetRow, string[]> = {
  assetName: ["assetname", "name"],
  assetNumber: ["assetnumber", "number"],
  assetStatus: ["assetstatus", "status"],
  purchaseDate: ["purchasedate"],
  purchasePrice: ["purchaseprice", "cost"],
  assetType: ["assettype", "type"],
  description: ["description"],
  serialNumber: ["serialnumber"],
  bookDepreciationStartDate: ["bookdepreciationstartdate", "depreciationstartdate"],
  bookCostLimit: ["bookcostlimit", "costlimit"],
  bookResidualValue: ["bookresidualvalue", "residualvalue", "residual"],
  bookDepreciationMethod: ["bookdepreciationmethod", "depreciationmethod", "method"],
  bookAveragingMethod: ["bookaveragingmethod", "averagingmethod", "averaging"],
  bookRate: ["bookrate", "rate"],
  bookEffectiveLife: ["bookeffectivelife", "effectivelife"],
  bookOpeningAccumulatedDep: [
    "bookopeningbookaccumulateddepreciation",
    "openingbookaccumulateddepreciation",
    "openingaccumulateddepreciation",
  ],
  bookValue: ["bookbookvalue", "bookvalue"],
  accumulatedDepreciation: ["accumulateddepreciation"],
  taxDepreciationMethod: ["taxdepreciationmethod"],
  taxAveragingMethod: ["taxaveragingmethod"],
  taxRate: ["taxrate"],
  taxOpeningAccumulatedDep: ["taxopeningaccumulateddepreciation"],
  taxValue: ["taxvalue"],
  taxAccumulatedDepreciation: ["taxaccumulateddepreciation"],
  depreciationToDate: ["depreciationtodate"],
  disposalDate: ["disposaldate"],
};

function pick(rec: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    if (rec[k] != null && rec[k] !== "") return rec[k];
  }
  return "";
}

function rowFromRecord(rec: Record<string, string>): XeroAssetRow | null {
  const name = pick(rec, FIELD_ALIASES.assetName).trim();
  const number = pick(rec, FIELD_ALIASES.assetNumber).trim();
  if (!name && !number) return null;
  const methodRaw = pick(rec, FIELD_ALIASES.bookDepreciationMethod);
  const avgRaw = pick(rec, FIELD_ALIASES.bookAveragingMethod);
  const taxMethodRaw = pick(rec, FIELD_ALIASES.taxDepreciationMethod);
  const taxAvgRaw = pick(rec, FIELD_ALIASES.taxAveragingMethod);
  return {
    assetName: name,
    assetNumber: number,
    assetStatus: pick(rec, FIELD_ALIASES.assetStatus) || "Registered",
    purchaseDate: asIsoDate(pick(rec, FIELD_ALIASES.purchaseDate)),
    purchasePrice: asNumber(pick(rec, FIELD_ALIASES.purchasePrice)),
    assetType: pick(rec, FIELD_ALIASES.assetType) || "Plant & Equipment",
    description: pick(rec, FIELD_ALIASES.description),
    serialNumber: pick(rec, FIELD_ALIASES.serialNumber),
    bookDepreciationStartDate:
      asIsoDate(pick(rec, FIELD_ALIASES.bookDepreciationStartDate)) ||
      asIsoDate(pick(rec, FIELD_ALIASES.purchaseDate)),
    bookCostLimit: asOptionalNumber(pick(rec, FIELD_ALIASES.bookCostLimit)),
    bookResidualValue: asNumber(pick(rec, FIELD_ALIASES.bookResidualValue)),
    bookDepreciationMethod: parseBookMethod(methodRaw || "Diminishing Value"),
    bookAveragingMethod: parseAveragingMethod(avgRaw || "Actual Days"),
    bookRate: asNumber(pick(rec, FIELD_ALIASES.bookRate)),
    bookEffectiveLife: asOptionalNumber(pick(rec, FIELD_ALIASES.bookEffectiveLife)),
    bookOpeningAccumulatedDep: asNumber(
      pick(rec, FIELD_ALIASES.bookOpeningAccumulatedDep)
    ),
    bookValue: asNumber(pick(rec, FIELD_ALIASES.bookValue)),
    accumulatedDepreciation: asNumber(
      pick(rec, FIELD_ALIASES.accumulatedDepreciation)
    ),
    taxDepreciationMethod: taxMethodRaw ? parseBookMethod(taxMethodRaw) : null,
    taxAveragingMethod: taxAvgRaw ? parseAveragingMethod(taxAvgRaw) : null,
    taxRate: asOptionalNumber(pick(rec, FIELD_ALIASES.taxRate)),
    taxOpeningAccumulatedDep: asOptionalNumber(
      pick(rec, FIELD_ALIASES.taxOpeningAccumulatedDep)
    ),
    taxValue: asOptionalNumber(pick(rec, FIELD_ALIASES.taxValue)),
    taxAccumulatedDepreciation: asOptionalNumber(
      pick(rec, FIELD_ALIASES.taxAccumulatedDepreciation)
    ),
    depreciationToDate: asIsoDate(pick(rec, FIELD_ALIASES.depreciationToDate)),
    disposalDate: asIsoDate(pick(rec, FIELD_ALIASES.disposalDate)),
  };
}

function recordsFromGrid(grid: string[][]): XeroAssetRow[] {
  if (!grid.length) return [];
  const headers = grid[0].map((h) => headerKey(h));
  const rows: XeroAssetRow[] = [];
  for (const line of grid.slice(1)) {
    if (!line.some((c) => String(c || "").trim())) continue;
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) rec[h] = line[i] == null ? "" : String(line[i]);
    });
    const row = rowFromRecord(rec);
    if (row) rows.push(row);
  }
  return rows;
}

export function parseXeroAssetsXlsx(buffer: Buffer): XeroAssetRow[] {
  const files = unzip(buffer);
  const sstXml = files.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  const strings = sstXml ? parseSharedStrings(sstXml) : [];
  const sheetPath = firstSheetPath(files);
  const sheetXml = files.get(sheetPath)?.toString("utf8");
  if (!sheetXml) throw new Error("Worksheet XML missing");
  return recordsFromGrid(parseSheetRows(sheetXml, strings));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function parseXeroAssetsCsv(text: string): XeroAssetRow[] {
  return recordsFromGrid(parseCsv(text));
}

export function parseXeroAssetsFile(
  buffer: Buffer,
  filename?: string
): XeroAssetRow[] {
  const name = String(filename || "").toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv")) {
    const text = buffer.toString("utf8");
    if (name.endsWith(".tsv")) {
      const grid = text
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((l) => l.split("\t"));
      return recordsFromGrid(grid);
    }
    return parseXeroAssetsCsv(text);
  }
  if (buffer.subarray(0, 2).toString() === "PK") {
    return parseXeroAssetsXlsx(buffer);
  }
  return parseXeroAssetsCsv(buffer.toString("utf8"));
}

export function defaultRateFromLife(
  method: BookMethod,
  lifeYears: number | null | undefined
): number {
  const life = Number(lifeYears);
  if (!Number.isFinite(life) || life <= 0) return 0;
  if (method === "straight_line") return round4(100 / life);
  return round4(200 / life);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
