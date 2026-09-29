/**
 * Per-owner fixed-asset register.
 * Lives under OZINTEL_DATA_DIR/owners/{email}/accounting/assets.json —
 * same silo as invoices/ledger. New users start empty.
 */

import { promises as fs } from "fs";
import { getAccountingDataDir, getAssetsFilePath } from "@/lib/dataPaths";
import {
  appendLedgerEntries,
  readBankAccounts,
  readCoa,
  type LedgerEntry,
} from "@/lib/accounting/store";
import { round2 } from "@/lib/accounting/invoiceMath";
import {
  addIsoDays,
  averagingLabel,
  chargeForPeriod,
  compareIso,
  isoDay,
  methodLabel,
  positionAt,
  type AveragingMethod,
  type BookMethod,
} from "@/lib/accounting/depreciation";
import {
  accountsForAssetType,
  ASSET_TYPE_OPTIONS,
  parseXeroAssetsFile,
  type XeroAssetRow,
} from "@/lib/accounting/xeroAssetsImport";

export type AssetStatus = "draft" | "registered" | "disposed";

export type FixedAsset = {
  id: string;
  number: string;
  name: string;
  assetType: string;
  status: AssetStatus;
  purchaseDate: string;
  cost: number;
  residualValue: number;
  costLimit: number | null;
  description: string;
  serialNumber: string;
  bookMethod: BookMethod;
  bookRate: number;
  bookEffectiveLife: number | null;
  bookAveraging: AveragingMethod;
  bookDepreciationStartDate: string;
  openingAccumulatedDep: number;
  taxMethod: BookMethod | null;
  taxRate: number | null;
  taxAveraging: AveragingMethod | null;
  taxOpeningAccumulatedDep: number | null;
  assetAccountCode: string;
  accumDepAccountCode: string;
  depExpenseAccountCode: string;
  disposalAccountCode: string;
  /** WDV after last posted run or import snapshot. */
  bookValue: number;
  accumulatedDepreciation: number;
  /** Inclusive date depreciation has been run through. */
  lastDepreciatedTo: string | null;
  disposalDate: string | null;
  disposalProceeds: number | null;
  disposalLedgerEntryIds: string[];
  xeroAssetNumber: string;
  importedAsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DepreciationRunLine = {
  assetId: string;
  assetNumber: string;
  name: string;
  charge: number;
  openingBookValue: number;
  closingBookValue: number;
  days: number;
};

export type DepreciationRun = {
  id: string;
  number: string;
  from: string;
  to: string;
  postedAt: string;
  journalRef: string;
  ledgerEntryIds: string[];
  lines: DepreciationRunLine[];
  totalCharge: number;
  assetCount: number;
};

export type AssetStoreFile = {
  assets: FixedAsset[];
  runs: DepreciationRun[];
};

export type AssetInput = Partial<FixedAsset> & {
  name?: string;
};

export type AssetRegisterLine = {
  asset: FixedAsset;
  cost: number;
  accumulatedDep: number;
  bookValue: number;
  unpostedCharge: number;
};

export type EofyScheduleLine = {
  assetId: string;
  number: string;
  name: string;
  assetType: string;
  method: string;
  rate: number;
  cost: number;
  openingBookValue: number;
  charge: number;
  closingBookValue: number;
  openingAccumulatedDep: number;
  closingAccumulatedDep: number;
};

const EMPTY_STORE: AssetStoreFile = { assets: [], runs: [] };
const DISPOSAL_COA = "0920";

let assetsChain: Promise<unknown> = Promise.resolve();
function withAssetsLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = assetsChain.then(fn, fn);
  assetsChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function ensureDir() {
  await fs.mkdir(getAccountingDataDir(), { recursive: true });
}

async function writeStoreUnlocked(store: AssetStoreFile) {
  await ensureDir();
  const target = getAssetsFilePath();
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(
    { assets: store.assets, runs: store.runs },
    null,
    2
  );
  await fs.writeFile(tmp, payload, "utf8");
  try {
    await fs.rename(tmp, target);
  } catch {
    await fs.copyFile(tmp, target);
    await fs.unlink(tmp).catch(() => undefined);
  }
}

async function readStoreUnlocked(): Promise<AssetStoreFile> {
  await ensureDir();
  try {
    const raw = await fs.readFile(getAssetsFilePath(), "utf8");
    const parsed = JSON.parse(raw || "{}");
    const assets = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.assets)
        ? parsed.assets
        : [];
    const runs = Array.isArray(parsed?.runs) ? parsed.runs : [];
    return { assets: assets as FixedAsset[], runs: runs as DepreciationRun[] };
  } catch {
    await writeStoreUnlocked({ ...EMPTY_STORE });
    return { assets: [], runs: [] };
  }
}

export async function readAssetStore(): Promise<AssetStoreFile> {
  return readStoreUnlocked();
}

export async function readAssets(): Promise<FixedAsset[]> {
  const store = await readStoreUnlocked();
  return store.assets;
}

export async function readDepreciationRuns(): Promise<DepreciationRun[]> {
  const store = await readStoreUnlocked();
  return store.runs;
}

function nowIso() {
  return new Date().toISOString();
}

function stampId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function asStatus(raw: unknown): AssetStatus {
  const s = String(raw || "").toLowerCase();
  if (s === "registered") return "registered";
  if (s === "disposed") return "disposed";
  return "draft";
}

export function nextAssetNumber(assets: FixedAsset[]): string {
  let max = 0;
  for (const a of assets) {
    const m = String(a.number || "").match(/FA-(\d+)/i);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `FA-${String(max + 1).padStart(4, "0")}`;
}

function depInputOf(asset: FixedAsset) {
  return {
    cost: asset.cost,
    residualValue: asset.residualValue,
    costLimit: asset.costLimit,
    method: asset.bookMethod,
    ratePercent: asset.bookRate,
    averaging: asset.bookAveraging,
    depreciationStart: asset.bookDepreciationStartDate || asset.purchaseDate,
    disposalDate: asset.disposalDate,
    openingAccumulatedDep: asset.openingAccumulatedDep,
  };
}

function currentPosition(asset: FixedAsset, asAt: string) {
  return positionAt(
    depInputOf(asset),
    asAt,
    asset.bookValue,
    asset.lastDepreciatedTo || asset.importedAsAt || undefined
  );
}

function normalizeAsset(
  input: AssetInput,
  existing: FixedAsset | null,
  all: FixedAsset[]
): FixedAsset {
  const name = String(input.name ?? existing?.name ?? "").trim();
  if (!name) throw new Error("Asset name is required");
  const assetType =
    String(input.assetType ?? existing?.assetType ?? "Plant & Equipment").trim() ||
    "Plant & Equipment";
  const accounts = accountsForAssetType(assetType);
  const purchaseDate =
    isoDay(input.purchaseDate || existing?.purchaseDate || "") ||
    isoDay(new Date().toISOString());
  const depStart =
    isoDay(
      input.bookDepreciationStartDate ||
        existing?.bookDepreciationStartDate ||
        purchaseDate
    ) || purchaseDate;
  const cost = round2(Number(input.cost ?? existing?.cost) || 0);
  if (cost < 0) throw new Error("Cost cannot be negative");
  const residual = round2(
    Number(input.residualValue ?? existing?.residualValue) || 0
  );
  const method = (input.bookMethod ||
    existing?.bookMethod ||
    "diminishing_value") as BookMethod;
  const averaging = (input.bookAveraging ||
    existing?.bookAveraging ||
    "actual_days") as AveragingMethod;
  const rate = Number(input.bookRate ?? existing?.bookRate) || 0;
  const openingAccum = round2(
    Number(input.openingAccumulatedDep ?? existing?.openingAccumulatedDep) || 0
  );
  const status = asStatus(input.status ?? existing?.status ?? "draft");
  const number =
    String(input.number ?? existing?.number ?? "").trim() ||
    nextAssetNumber(all.filter((a) => a.id !== existing?.id));

  const draft: FixedAsset = {
    id: existing?.id || stampId("FA"),
    number,
    name,
    assetType,
    status,
    purchaseDate,
    cost,
    residualValue: residual,
    costLimit:
      input.costLimit === undefined
        ? existing?.costLimit ?? null
        : input.costLimit,
    description: String(input.description ?? existing?.description ?? ""),
    serialNumber: String(input.serialNumber ?? existing?.serialNumber ?? ""),
    bookMethod: method,
    bookRate: rate,
    bookEffectiveLife:
      input.bookEffectiveLife === undefined
        ? existing?.bookEffectiveLife ?? null
        : input.bookEffectiveLife,
    bookAveraging: averaging,
    bookDepreciationStartDate: depStart,
    openingAccumulatedDep: openingAccum,
    taxMethod:
      input.taxMethod === undefined
        ? existing?.taxMethod ?? null
        : input.taxMethod,
    taxRate: input.taxRate === undefined ? existing?.taxRate ?? null : input.taxRate,
    taxAveraging:
      input.taxAveraging === undefined
        ? existing?.taxAveraging ?? null
        : input.taxAveraging,
    taxOpeningAccumulatedDep:
      input.taxOpeningAccumulatedDep === undefined
        ? existing?.taxOpeningAccumulatedDep ?? null
        : input.taxOpeningAccumulatedDep,
    assetAccountCode:
      String(input.assetAccountCode ?? existing?.assetAccountCode ?? "").trim() ||
      accounts.assetCode,
    accumDepAccountCode:
      String(
        input.accumDepAccountCode ?? existing?.accumDepAccountCode ?? ""
      ).trim() || accounts.accumCode,
    depExpenseAccountCode:
      String(
        input.depExpenseAccountCode ?? existing?.depExpenseAccountCode ?? ""
      ).trim() || accounts.expenseCode,
    disposalAccountCode:
      String(
        input.disposalAccountCode ?? existing?.disposalAccountCode ?? ""
      ).trim() || DISPOSAL_COA,
    bookValue: round2(
      Number(input.bookValue ?? existing?.bookValue) ||
        Math.max(residual, cost - openingAccum)
    ),
    accumulatedDepreciation: round2(
      Number(
        input.accumulatedDepreciation ?? existing?.accumulatedDepreciation
      ) || openingAccum
    ),
    lastDepreciatedTo:
      input.lastDepreciatedTo === undefined
        ? existing?.lastDepreciatedTo ?? null
        : input.lastDepreciatedTo,
    disposalDate:
      input.disposalDate === undefined
        ? existing?.disposalDate ?? null
        : input.disposalDate,
    disposalProceeds:
      input.disposalProceeds === undefined
        ? existing?.disposalProceeds ?? null
        : input.disposalProceeds,
    disposalLedgerEntryIds: existing?.disposalLedgerEntryIds || [],
    xeroAssetNumber: String(
      input.xeroAssetNumber ?? existing?.xeroAssetNumber ?? ""
    ),
    importedAsAt:
      input.importedAsAt === undefined
        ? existing?.importedAsAt ?? null
        : input.importedAsAt,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };

  if (draft.bookValue < residual) draft.bookValue = residual;
  draft.accumulatedDepreciation = round2(
    Math.max(0, draft.cost - draft.bookValue)
  );
  return draft;
}

export async function upsertAsset(input: AssetInput): Promise<FixedAsset> {
  return withAssetsLock(async () => {
    const store = await readStoreUnlocked();
    const id = String(input.id || "").trim();
    const idx = id ? store.assets.findIndex((a) => a.id === id) : -1;
    const existing = idx >= 0 ? store.assets[idx] : null;
    const asset = normalizeAsset(input, existing, store.assets);
    if (idx >= 0) store.assets[idx] = asset;
    else store.assets.push(asset);
    await writeStoreUnlocked(store);
    return asset;
  });
}

export async function deleteAsset(id: string): Promise<boolean> {
  return withAssetsLock(async () => {
    const store = await readStoreUnlocked();
    const asset = store.assets.find((a) => a.id === id);
    if (!asset) return false;
    if (asset.status !== "draft") {
      throw new Error("Only draft assets can be deleted");
    }
    store.assets = store.assets.filter((a) => a.id !== id);
    await writeStoreUnlocked(store);
    return true;
  });
}

export async function registerAsset(id: string): Promise<FixedAsset> {
  return withAssetsLock(async () => {
    const store = await readStoreUnlocked();
    const idx = store.assets.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error("Asset not found");
    const asset = store.assets[idx];
    if (asset.status === "disposed") {
      throw new Error("A disposed asset cannot be registered again");
    }
    if (asset.status === "registered") return asset;
    const next: FixedAsset = {
      ...asset,
      status: "registered",
      updatedAt: nowIso(),
    };
    if (!next.lastDepreciatedTo) {
      next.lastDepreciatedTo = addIsoDays(
        next.bookDepreciationStartDate || next.purchaseDate,
        -1
      );
    }
    store.assets[idx] = next;
    await writeStoreUnlocked(store);
    return next;
  });
}

function coaLookup(coa: Awaited<ReturnType<typeof readCoa>>) {
  return new Map(coa.map((a) => [a.code, a]));
}

function ledgerLine(opts: {
  id: string;
  date: string;
  description: string;
  amount: number;
  code: string;
  coaByCode: Map<string, { code: string; name: string; type: string }>;
  source: string;
  journalRef: string;
  assetId: string;
  assetNumber: string;
  extra?: Record<string, unknown>;
}): Partial<LedgerEntry> {
  const acc = opts.coaByCode.get(opts.code);
  return {
    id: opts.id,
    date: opts.date,
    description: opts.description,
    amount: opts.amount,
    type: acc?.type || (opts.amount >= 0 ? "Expense" : "Asset"),
    account: `${opts.code} - ${acc?.name || opts.code}`,
    accountCode: opts.code,
    accountName: acc?.name || opts.code,
    hasGST: false,
    noGST: true,
    taxCode: "N-T",
    reconciled: false,
    source: opts.source,
    journalRef: opts.journalRef,
    assetId: opts.assetId,
    assetNumber: opts.assetNumber,
    timestamp: nowIso(),
    ...opts.extra,
  };
}

export type DisposeInput = {
  id: string;
  disposalDate: string;
  proceeds?: number;
  bankAccountId?: string;
  postJournals?: boolean;
};

export async function disposeAsset(input: DisposeInput): Promise<FixedAsset> {
  return withAssetsLock(async () => {
    const store = await readStoreUnlocked();
    const idx = store.assets.findIndex((a) => a.id === input.id);
    if (idx < 0) throw new Error("Asset not found");
    const asset = store.assets[idx];
    if (asset.status === "disposed") return asset;
    const disposalDate = isoDay(input.disposalDate);
    if (!disposalDate) throw new Error("Disposal date is required");
    const proceeds = round2(Number(input.proceeds) || 0);

    const until = addIsoDays(disposalDate, 0);
    const startFrom = asset.lastDepreciatedTo
      ? addIsoDays(asset.lastDepreciatedTo, 1)
      : asset.bookDepreciationStartDate || asset.purchaseDate;
    let working = { ...asset };
    if (compareIso(startFrom, until) <= 0 && asset.status === "registered") {
      const charge = chargeForPeriod(
        depInputOf(working),
        startFrom,
        until,
        working.bookValue
      );
      if (charge.charge > 0.009) {
        const posted = await postChargeLines(
          store,
          working,
          {
            from: startFrom,
            to: until,
            lines: [
              {
                assetId: working.id,
                assetNumber: working.number,
                name: working.name,
                charge: charge.charge,
                openingBookValue: charge.openingBookValue,
                closingBookValue: charge.closingBookValue,
                days: charge.days,
              },
            ],
          },
          `Disposal dep ${working.number}`
        );
        working = posted.asset;
      } else {
        working.bookValue = charge.closingBookValue;
        working.accumulatedDepreciation = charge.closingAccumulatedDep;
        working.lastDepreciatedTo = until;
      }
    }

    const nbv = round2(working.bookValue);
    const accum = round2(working.accumulatedDepreciation);
    const ledgerIds: string[] = [...(working.disposalLedgerEntryIds || [])];

    if (input.postJournals !== false) {
      const coa = await readCoa();
      const coaByCode = coaLookup(coa);
      const banks = await readBankAccounts();
      const bank = banks.find((b) => b.id === input.bankAccountId);
      const journalRef = `DISP-${working.number}`;
      const desc = `Dispose ${working.number} ${working.name}`;
      const entries: Partial<LedgerEntry>[] = [];
      let i = 0;
      if (accum > 0.009) {
        entries.push(
          ledgerLine({
            id: stampId(`disp-accum-${i++}`),
            date: disposalDate,
            description: desc,
            amount: accum,
            code: working.accumDepAccountCode,
            coaByCode,
            source: "asset-disposal",
            journalRef,
            assetId: working.id,
            assetNumber: working.number,
          })
        );
      }
      entries.push(
        ledgerLine({
          id: stampId(`disp-cost-${i++}`),
          date: disposalDate,
          description: desc,
          amount: -working.cost,
          code: working.assetAccountCode,
          coaByCode,
          source: "asset-disposal",
          journalRef,
          assetId: working.id,
          assetNumber: working.number,
        })
      );
      if (proceeds > 0.009) {
        const bankCode = bank?.id ? "2000" : "2475";
        const bankAcc =
          bank && /nab business/i.test(bank.name)
            ? "2020"
            : bank && /anz/i.test(bank.name)
              ? "2030"
              : bank && /credit card/i.test(bank.name)
                ? "2010"
                : bankCode;
        entries.push({
          ...ledgerLine({
            id: stampId(`disp-proc-${i++}`),
            date: disposalDate,
            description: `${desc} — proceeds`,
            amount: proceeds,
            code: bank ? bankAcc : "2475",
            coaByCode,
            source: "asset-disposal",
            journalRef,
            assetId: working.id,
            assetNumber: working.number,
          }),
          type: "Asset",
          bankAccountId: bank?.id,
          bankAccountName: bank?.name,
        });
      }
      const pl = round2(proceeds - nbv);
      if (Math.abs(pl) > 0.009) {
        const isGain = pl > 0;
        entries.push(
          ledgerLine({
            id: stampId(`disp-pl-${i++}`),
            date: disposalDate,
            description: `${desc} — ${isGain ? "gain" : "loss"}`,
            amount: isGain ? -pl : round2(-pl),
            code: working.disposalAccountCode || DISPOSAL_COA,
            coaByCode,
            source: "asset-disposal",
            journalRef,
            assetId: working.id,
            assetNumber: working.number,
            extra: {
              type: isGain ? "Revenue" : "Expense",
            },
          })
        );
      }

      const debit = entries
        .filter((e) => (e.amount || 0) > 0)
        .reduce((s, e) => s + (e.amount || 0), 0);
      const credit = entries
        .filter((e) => (e.amount || 0) < 0)
        .reduce((s, e) => s + Math.abs(e.amount || 0), 0);
      if (Math.abs(debit - credit) > 0.02) {
        throw new Error(
          `Unbalanced disposal journal (Dr ${round2(debit)} vs Cr ${round2(credit)})`
        );
      }
      const result = await appendLedgerEntries(entries);
      ledgerIds.push(...result.savedEntries.map((e) => e.id));
    }

    const next: FixedAsset = {
      ...working,
      status: "disposed",
      disposalDate,
      disposalProceeds: proceeds,
      disposalLedgerEntryIds: ledgerIds,
      bookValue: 0,
      accumulatedDepreciation: round2(working.cost),
      lastDepreciatedTo: disposalDate,
      updatedAt: nowIso(),
    };
    const storeIdx = store.assets.findIndex((a) => a.id === working.id);
    store.assets[storeIdx] = next;
    await writeStoreUnlocked(store);
    return next;
  });
}

async function postChargeLines(
  store: AssetStoreFile,
  asset: FixedAsset,
  payload: {
    from: string;
    to: string;
    lines: DepreciationRunLine[];
  },
  note?: string
): Promise<{ asset: FixedAsset; run: DepreciationRun }> {
  const coa = await readCoa();
  const coaByCode = coaLookup(coa);
  const total = round2(payload.lines.reduce((s, l) => s + l.charge, 0));
  const runNumber = `DEP-${payload.to.replace(/-/g, "")}-${String(store.runs.length + 1).padStart(3, "0")}`;
  const journalRef = runNumber;
  const desc =
    note ||
    `Depreciation ${payload.from} to ${payload.to}`;
  const entries: Partial<LedgerEntry>[] = [];
  let i = 0;
  for (const line of payload.lines) {
    if (line.charge < 0.01) continue;
    entries.push(
      ledgerLine({
        id: stampId(`dep-exp-${i++}`),
        date: payload.to,
        description: `${desc} — ${line.assetNumber} ${line.name}`,
        amount: line.charge,
        code: asset.depExpenseAccountCode,
        coaByCode,
        source: "depreciation",
        journalRef,
        assetId: line.assetId,
        assetNumber: line.assetNumber,
        extra: { depreciationRunId: runNumber, type: "Expense" },
      })
    );
    entries.push(
      ledgerLine({
        id: stampId(`dep-accum-${i++}`),
        date: payload.to,
        description: `${desc} — ${line.assetNumber} ${line.name}`,
        amount: -line.charge,
        code: asset.accumDepAccountCode,
        coaByCode,
        source: "depreciation",
        journalRef,
        assetId: line.assetId,
        assetNumber: line.assetNumber,
        extra: { depreciationRunId: runNumber, type: "Asset" },
      })
    );
  }
  const result =
    entries.length > 0
      ? await appendLedgerEntries(entries)
      : { savedEntries: [] as LedgerEntry[] };
  const line = payload.lines[0];
  const next: FixedAsset = {
    ...asset,
    bookValue: line?.closingBookValue ?? asset.bookValue,
    accumulatedDepreciation: round2(
      Math.max(0, asset.cost - (line?.closingBookValue ?? asset.bookValue))
    ),
    lastDepreciatedTo: payload.to,
    updatedAt: nowIso(),
  };
  const idx = store.assets.findIndex((a) => a.id === asset.id);
  if (idx >= 0) store.assets[idx] = next;
  const run: DepreciationRun = {
    id: stampId("DR"),
    number: runNumber,
    from: payload.from,
    to: payload.to,
    postedAt: nowIso(),
    journalRef,
    ledgerEntryIds: result.savedEntries.map((e) => e.id),
    lines: payload.lines,
    totalCharge: total,
    assetCount: payload.lines.length,
  };
  store.runs.push(run);
  return { asset: next, run };
}

export type DepRunRequest = {
  from: string;
  to: string;
  preview?: boolean;
};

export type DepRunResult = {
  from: string;
  to: string;
  preview: boolean;
  alreadyPosted: boolean;
  lines: DepreciationRunLine[];
  totalCharge: number;
  run?: DepreciationRun;
};

export async function runDepreciation(
  req: DepRunRequest
): Promise<DepRunResult> {
  const from = isoDay(req.from);
  const to = isoDay(req.to);
  if (!from || !to || compareIso(from, to) > 0) {
    throw new Error("Depreciation period from/to is required");
  }

  return withAssetsLock(async () => {
    const store = await readStoreUnlocked();
    const duplicate = store.runs.find(
      (r) => r.from === from && r.to === to
    );
    if (duplicate && !req.preview) {
      return {
        from,
        to,
        preview: false,
        alreadyPosted: true,
        lines: duplicate.lines,
        totalCharge: duplicate.totalCharge,
        run: duplicate,
      };
    }

    const lines: DepreciationRunLine[] = [];
    const nextAssets = store.assets.map((asset) => ({ ...asset }));

    for (const asset of nextAssets) {
      if (asset.status !== "registered") continue;
      const startFrom = asset.lastDepreciatedTo
        ? addIsoDays(asset.lastDepreciatedTo, 1)
        : asset.bookDepreciationStartDate || asset.purchaseDate;
      const periodFrom = compareIso(startFrom, from) > 0 ? startFrom : from;
      if (compareIso(periodFrom, to) > 0) continue;
      const charge = chargeForPeriod(
        depInputOf(asset),
        periodFrom,
        to,
        asset.bookValue
      );
      if (charge.charge < 0.005 && charge.days === 0) continue;
      lines.push({
        assetId: asset.id,
        assetNumber: asset.number,
        name: asset.name,
        charge: charge.charge,
        openingBookValue: charge.openingBookValue,
        closingBookValue: charge.closingBookValue,
        days: charge.days,
      });
      if (!req.preview) {
        asset.bookValue = charge.closingBookValue;
        asset.accumulatedDepreciation = charge.closingAccumulatedDep;
        asset.lastDepreciatedTo = to;
        asset.updatedAt = nowIso();
      }
    }

    const totalCharge = round2(lines.reduce((s, l) => s + l.charge, 0));
    if (req.preview) {
      return {
        from,
        to,
        preview: true,
        alreadyPosted: Boolean(duplicate),
        lines,
        totalCharge,
        run: duplicate,
      };
    }

    const coa = await readCoa();
    const coaByCode = coaLookup(coa);
    const runNumber = `DEP-${to.replace(/-/g, "")}-${String(store.runs.length + 1).padStart(3, "0")}`;
    const journalRef = runNumber;
    const desc = `Depreciation ${from} to ${to}`;
    const entries: Partial<LedgerEntry>[] = [];
    let i = 0;
    const byId = new Map(nextAssets.map((a) => [a.id, a]));
    for (const line of lines) {
      if (line.charge < 0.01) continue;
      const asset = byId.get(line.assetId);
      if (!asset) continue;
      entries.push(
        ledgerLine({
          id: stampId(`dep-exp-${i++}`),
          date: to,
          description: `${desc} — ${line.assetNumber} ${line.name}`,
          amount: line.charge,
          code: asset.depExpenseAccountCode,
          coaByCode,
          source: "depreciation",
          journalRef,
          assetId: line.assetId,
          assetNumber: line.assetNumber,
          extra: { depreciationRunId: runNumber, type: "Expense" },
        })
      );
      entries.push(
        ledgerLine({
          id: stampId(`dep-accum-${i++}`),
          date: to,
          description: `${desc} — ${line.assetNumber} ${line.name}`,
          amount: -line.charge,
          code: asset.accumDepAccountCode,
          coaByCode,
          source: "depreciation",
          journalRef,
          assetId: line.assetId,
          assetNumber: line.assetNumber,
          extra: { depreciationRunId: runNumber, type: "Asset" },
        })
      );
    }

    const result =
      entries.length > 0
        ? await appendLedgerEntries(entries)
        : { savedEntries: [] as LedgerEntry[] };

    const run: DepreciationRun = {
      id: stampId("DR"),
      number: runNumber,
      from,
      to,
      postedAt: nowIso(),
      journalRef,
      ledgerEntryIds: result.savedEntries.map((e) => e.id),
      lines,
      totalCharge,
      assetCount: lines.length,
    };
    store.assets = nextAssets;
    store.runs.push(run);
    await writeStoreUnlocked(store);
    return {
      from,
      to,
      preview: false,
      alreadyPosted: false,
      lines,
      totalCharge,
      run,
    };
  });
}

function xeroStatus(raw: string): AssetStatus {
  const s = String(raw || "").toLowerCase();
  if (s.includes("dispos")) return "disposed";
  if (s.includes("draft")) return "draft";
  return "registered";
}

function assetFromXeroRow(row: XeroAssetRow, existingId?: string): FixedAsset {
  const accounts = accountsForAssetType(row.assetType);
  const cost = round2(row.purchasePrice);
  const residual = round2(row.bookResidualValue);
  const importedAsAt = row.depreciationToDate || row.disposalDate || "";
  const xeroBv = round2(row.bookValue);
  const xeroAccum = round2(row.accumulatedDepreciation);
  const hasSnapshot = importedAsAt && (xeroBv > 0 || xeroAccum > 0 || cost > 0);
  const bookValue = hasSnapshot
    ? Math.max(residual, xeroBv)
    : round2(Math.max(residual, cost - round2(row.bookOpeningAccumulatedDep)));
  const accum = hasSnapshot
    ? xeroAccum || round2(Math.max(0, cost - bookValue))
    : round2(row.bookOpeningAccumulatedDep);
  const status = xeroStatus(row.assetStatus);
  const ts = nowIso();
  return {
    id: existingId || stampId("FA"),
    number: row.assetNumber || "",
    name: row.assetName,
    assetType: accounts.label,
    status,
    purchaseDate: row.purchaseDate,
    cost,
    residualValue: residual,
    costLimit: row.bookCostLimit,
    description: row.description,
    serialNumber: row.serialNumber,
    bookMethod: row.bookDepreciationMethod,
    bookRate: row.bookRate,
    bookEffectiveLife: row.bookEffectiveLife,
    bookAveraging: row.bookAveragingMethod,
    bookDepreciationStartDate:
      row.bookDepreciationStartDate || row.purchaseDate,
    openingAccumulatedDep: round2(row.bookOpeningAccumulatedDep),
    taxMethod: row.taxDepreciationMethod,
    taxRate: row.taxRate,
    taxAveraging: row.taxAveragingMethod,
    taxOpeningAccumulatedDep: row.taxOpeningAccumulatedDep,
    assetAccountCode: accounts.assetCode,
    accumDepAccountCode: accounts.accumCode,
    depExpenseAccountCode: accounts.expenseCode,
    disposalAccountCode: DISPOSAL_COA,
    bookValue,
    accumulatedDepreciation: accum,
    lastDepreciatedTo:
      importedAsAt ||
      (status === "disposed" ? row.disposalDate : null),
    disposalDate: row.disposalDate || null,
    disposalProceeds: null,
    disposalLedgerEntryIds: [],
    xeroAssetNumber: row.assetNumber,
    importedAsAt: importedAsAt || null,
    createdAt: ts,
    updatedAt: ts,
  };
}

export type ImportAssetsResult = {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
  assets: FixedAsset[];
};

export async function importXeroAssetsBuffer(
  buffer: Buffer,
  filename?: string,
  opts?: { replace?: boolean }
): Promise<ImportAssetsResult> {
  const rows = parseXeroAssetsFile(buffer, filename);
  return importXeroAssetRows(rows, opts);
}

export async function importXeroAssetRows(
  rows: XeroAssetRow[],
  opts?: { replace?: boolean }
): Promise<ImportAssetsResult> {
  return withAssetsLock(async () => {
    const store = opts?.replace
      ? { assets: [] as FixedAsset[], runs: [] as DepreciationRun[] }
      : await readStoreUnlocked();
    const byNumber = new Map(
      store.assets.map((a) => [a.number.toUpperCase(), a])
    );
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const usedNumbers = new Set(store.assets.map((a) => a.number.toUpperCase()));

    for (const row of rows) {
      if (!row.assetName && !row.assetNumber) {
        skipped += 1;
        continue;
      }
      const key = String(row.assetNumber || "").toUpperCase();
      const existing = key ? byNumber.get(key) : undefined;
      const asset = assetFromXeroRow(row, existing?.id);
      if (!asset.number) {
        asset.number = nextAssetNumber(store.assets);
      }
      if (existing) {
        asset.createdAt = existing.createdAt;
        asset.disposalLedgerEntryIds = existing.disposalLedgerEntryIds;
        const idx = store.assets.findIndex((a) => a.id === existing.id);
        store.assets[idx] = asset;
        byNumber.set(asset.number.toUpperCase(), asset);
        updated += 1;
      } else {
        if (usedNumbers.has(asset.number.toUpperCase())) {
          asset.number = nextAssetNumber(store.assets);
        }
        store.assets.push(asset);
        byNumber.set(asset.number.toUpperCase(), asset);
        usedNumbers.add(asset.number.toUpperCase());
        imported += 1;
      }
    }
    await writeStoreUnlocked(store);
    return {
      imported,
      updated,
      skipped,
      total: store.assets.length,
      assets: store.assets,
    };
  });
}

export function buildAssetRegister(
  assets: FixedAsset[],
  asAt: string
): AssetRegisterLine[] {
  const day = isoDay(asAt);
  return assets
    .map((asset) => {
      const pos = currentPosition(asset, day);
      const unposted =
        asset.status === "registered" &&
        asset.lastDepreciatedTo &&
        compareIso(asset.lastDepreciatedTo, day) < 0
          ? round2(Math.max(0, asset.bookValue - pos.bookValue))
          : 0;
      return {
        asset,
        cost: asset.cost,
        accumulatedDep: pos.accumulatedDep,
        bookValue: pos.bookValue,
        unpostedCharge: unposted,
      };
    })
    .sort((a, b) => a.asset.number.localeCompare(b.asset.number));
}

export function buildEofySchedule(
  assets: FixedAsset[],
  fyFrom: string,
  fyTo: string
): EofyScheduleLine[] {
  const from = isoDay(fyFrom);
  const to = isoDay(fyTo);
  const lines: EofyScheduleLine[] = [];
  for (const asset of assets) {
    if (asset.status === "draft") continue;
    const openingPos = currentPosition(asset, addIsoDays(from, -1));
    const charge = chargeForPeriod(
      depInputOf(asset),
      from,
      to,
      openingPos.bookValue
    );
    lines.push({
      assetId: asset.id,
      number: asset.number,
      name: asset.name,
      assetType: asset.assetType,
      method: methodLabel(asset.bookMethod),
      rate: asset.bookRate,
      cost: asset.cost,
      openingBookValue: charge.openingBookValue,
      charge: charge.charge,
      closingBookValue: charge.closingBookValue,
      openingAccumulatedDep: charge.openingAccumulatedDep,
      closingAccumulatedDep: charge.closingAccumulatedDep,
    });
  }
  return lines.sort((a, b) => a.number.localeCompare(b.number));
}

export function assetTypeOptions() {
  return ASSET_TYPE_OPTIONS;
}

export { methodLabel, averagingLabel };
