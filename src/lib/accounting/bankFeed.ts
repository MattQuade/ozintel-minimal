import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getBankFeedFilePath, getBankFeedIndexPath } from "@/lib/dataPaths";
import { toIsoDateInput } from "@/lib/accounting/dates";
import { addRowsToImportBatch } from "@/lib/accounting/importBatch";
import {
  isOpenForAllocation,
  type InvoiceMatchCandidate,
} from "@/lib/accounting/invoiceDepositMatch";
import { readInvoices } from "@/lib/accounting/invoices";
import { round2 } from "@/lib/accounting/invoiceMath";
import {
  readBankAccounts,
  writeBankAccounts,
  type BankAccount,
} from "@/lib/accounting/store";

const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const MAX_SEEN_DELIVERIES = 100;
const SIGNATURE_MAX_AGE_SEC = 300;

const ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

export type BankFeedConfig = {
  token: string;
  signingSecret: string;
  createdAt: string;
  accountMap: Record<string, string>;
  seenDeliveryIds: string[];
};

export type FeedBankChoice = {
  bankAccountId: string;
  bankAccountName: string;
  /** Set when this Redbark account has no OzIntel bank account yet. */
  create?: { id: string; name: string };
};

export type FeedRow = {
  providerId: string;
  accountKey: string;
  accountName: string;
  date: string;
  amount: number;
  description: string;
};

export function isFeedToken(token: string): boolean {
  return TOKEN_RE.test(String(token || ""));
}

export function hashFeedToken(token: string): string {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

export function newFeedToken(): string {
  return randomBytes(32).toString("base64url");
}

export function feedBankId(accountKey: string): string {
  const safe = String(accountKey || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  return `feed-${safe || "account"}`;
}

/** Redbark sends minor units. AUD 4550 is $45.50. A debit is already negative. */
export function minorUnitsToAmount(
  minor: unknown,
  currency: unknown
): number | null {
  const n = typeof minor === "number" ? minor : Number(minor);
  if (!Number.isFinite(n)) return null;
  const code = String(currency || "aud").trim().toLowerCase();
  if (ZERO_DECIMAL.has(code)) return round2(n);
  return round2(n / 100);
}

export function feedDescription(txn: Record<string, unknown>): string {
  const main = String(txn.description || txn.merchant_name || "").trim();
  const extra = String(txn.extended_description || "").trim();
  const ref = String(txn.reference || "").trim();
  const parts = [main];
  if (extra && extra.toLowerCase() !== main.toLowerCase()) parts.push(extra);
  if (ref && !main.toLowerCase().includes(ref.toLowerCase())) parts.push(ref);
  const text = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return (text || "Bank transaction").slice(0, 500);
}

export function feedDate(txn: Record<string, unknown>): string {
  const local = String(txn.local_date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(local)) return local;
  const raw = String(txn.transaction_date || txn.post_date || "").trim();
  return toIsoDateInput(raw);
}

/**
 * Posted bank rows only. Pending lines are skipped because a later posted
 * copy can arrive under a different id.
 */
export function redbarkFeedRows(payload: unknown): {
  eventType: string;
  deliveryId: string;
  rows: FeedRow[];
  pending: number;
} {
  const event =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const eventType = String(event.type || "");
  const deliveryId = String(event.id || "").trim();
  if (eventType !== "transactions.synced") {
    return { eventType, deliveryId, rows: [], pending: 0 };
  }
  const data =
    event.data && typeof event.data === "object"
      ? (event.data as Record<string, unknown>)
      : {};
  const incoming = [
    ...(Array.isArray(data.new) ? data.new : []),
    ...(Array.isArray(data.updated) ? data.updated : []),
  ];
  const rows: FeedRow[] = [];
  let pending = 0;
  const seen = new Set<string>();
  for (const item of incoming) {
    if (!item || typeof item !== "object") continue;
    const txn = item as Record<string, unknown>;
    const status = String(txn.status || "posted").trim().toLowerCase();
    if (status !== "posted") {
      pending += 1;
      continue;
    }
    const providerId = String(txn.id || "").trim();
    if (providerId && seen.has(providerId)) continue;
    if (providerId) seen.add(providerId);
    const amount = minorUnitsToAmount(txn.amount, txn.currency);
    const date = feedDate(txn);
    if (amount == null || !date) continue;
    const accountKey = String(
      txn.account_public_id || txn.account_id || ""
    ).trim();
    const accountName = String(txn.account_name || txn.account || "").trim();
    rows.push({
      providerId,
      accountKey: accountKey || accountName || "account",
      accountName: accountName || "Bank feed",
      date,
      amount,
      description: feedDescription(txn),
    });
  }
  return { eventType, deliveryId, rows, pending };
}

export function matchFeedBankAccount(
  accounts: Array<Pick<BankAccount, "id" | "name">>,
  accountMap: Record<string, string>,
  row: Pick<FeedRow, "accountKey" | "accountName">
): FeedBankChoice {
  const mapped = String(accountMap[row.accountKey] || "").trim();
  const mappedAccount = accounts.find((account) => account.id === mapped);
  if (mappedAccount) {
    return {
      bankAccountId: mappedAccount.id,
      bankAccountName: mappedAccount.name,
    };
  }
  const wanted = row.accountName.trim().toLowerCase();
  const named = accounts.filter(
    (account) => account.name.trim().toLowerCase() === wanted && wanted
  );
  if (named.length === 1) {
    return { bankAccountId: named[0].id, bankAccountName: named[0].name };
  }
  const id = feedBankId(row.accountKey);
  const existing = accounts.find((account) => account.id === id);
  if (existing) {
    return { bankAccountId: existing.id, bankAccountName: existing.name };
  }
  return {
    bankAccountId: id,
    bankAccountName: row.accountName || "Bank feed",
    create: { id, name: row.accountName || "Bank feed" },
  };
}

export function verifyRedbarkSignature(opts: {
  secret: string;
  timestamp: string;
  signature: string;
  rawBody: string;
  nowMs?: number;
}): { ok: true } | { ok: false; reason: "missing" | "stale" | "mismatch" } {
  const secret = String(opts.secret || "");
  const timestamp = String(opts.timestamp || "").trim();
  const signature = String(opts.signature || "").trim();
  if (!secret || !timestamp || !signature) return { ok: false, reason: "missing" };
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return { ok: false, reason: "stale" };
  const now = (opts.nowMs ?? Date.now()) / 1000;
  if (Math.abs(now - seconds) > SIGNATURE_MAX_AGE_SEC) {
    return { ok: false, reason: "stale" };
  }
  const expected = `sha256=${createHmac("sha256", secret)
    .update(`${timestamp}.${opts.rawBody}`)
    .digest("hex")}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true };
}

function emptyConfig(): BankFeedConfig {
  return {
    token: "",
    signingSecret: "",
    createdAt: "",
    accountMap: {},
    seenDeliveryIds: [],
  };
}

export async function readBankFeedConfig(): Promise<BankFeedConfig> {
  try {
    const raw = await fs.readFile(getBankFeedFilePath(), "utf8");
    const parsed = JSON.parse(raw || "{}") as Partial<BankFeedConfig>;
    const accountMap =
      parsed.accountMap && typeof parsed.accountMap === "object"
        ? Object.fromEntries(
            Object.entries(parsed.accountMap).map(([key, value]) => [
              String(key),
              String(value || ""),
            ])
          )
        : {};
    return {
      token: String(parsed.token || ""),
      signingSecret: String(parsed.signingSecret || ""),
      createdAt: String(parsed.createdAt || ""),
      accountMap,
      seenDeliveryIds: Array.isArray(parsed.seenDeliveryIds)
        ? parsed.seenDeliveryIds.map((id) => String(id || "")).filter(Boolean)
        : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyConfig();
    throw error;
  }
}

async function writeBankFeedConfig(config: BankFeedConfig) {
  const target = getBankFeedFilePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(config, null, 2), "utf8");
}

async function readFeedIndex(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(getBankFeedIndexPath(), "utf8");
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const email = String(value || "").trim().toLowerCase();
      if (email.includes("@")) out[key] = email;
    }
    return out;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeFeedIndex(index: Record<string, string>) {
  const target = getBankFeedIndexPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(index, null, 2), "utf8");
}

export async function ownerEmailForFeedToken(
  token: string
): Promise<string | null> {
  if (!isFeedToken(token)) return null;
  const index = await readFeedIndex();
  return index[hashFeedToken(token)] || null;
}

async function rememberToken(email: string, token: string) {
  const index = await readFeedIndex();
  const owner = email.trim().toLowerCase();
  const next: Record<string, string> = {};
  for (const [hash, stored] of Object.entries(index)) {
    if (stored !== owner) next[hash] = stored;
  }
  next[hashFeedToken(token)] = owner;
  await writeFeedIndex(next);
}

/** Create the address once. A later call returns the same address. */
export async function ensureBankFeed(email: string): Promise<BankFeedConfig> {
  const current = await readBankFeedConfig();
  if (isFeedToken(current.token)) {
    const index = await readFeedIndex();
    const owner = email.trim().toLowerCase();
    if (index[hashFeedToken(current.token)] !== owner) {
      await rememberToken(email, current.token);
    }
    return current;
  }
  const config: BankFeedConfig = {
    ...emptyConfig(),
    token: newFeedToken(),
    createdAt: new Date().toISOString(),
  };
  await writeBankFeedConfig(config);
  await rememberToken(email, config.token);
  return config;
}

export async function rotateBankFeedToken(email: string): Promise<BankFeedConfig> {
  const current = await readBankFeedConfig();
  const config: BankFeedConfig = {
    ...current,
    token: newFeedToken(),
    createdAt: current.createdAt || new Date().toISOString(),
  };
  await writeBankFeedConfig(config);
  await rememberToken(email, config.token);
  return config;
}

export async function saveBankFeedSecret(secret: string): Promise<BankFeedConfig> {
  const trimmed = String(secret || "").trim();
  if (trimmed.length < 8 || trimmed.length > 200) {
    throw new Error("Paste the signing secret from Redbark.");
  }
  const current = await readBankFeedConfig();
  if (!isFeedToken(current.token)) {
    throw new Error("Create the feed address first.");
  }
  const config = { ...current, signingSecret: trimmed };
  await writeBankFeedConfig(config);
  return config;
}

export function secretHint(secret: string): string {
  const value = String(secret || "");
  if (value.length < 4) return "";
  return value.slice(-4);
}

async function openInvoiceCandidates(): Promise<InvoiceMatchCandidate[]> {
  try {
    const invoices = await readInvoices();
    return invoices
      .map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        amountDue: invoice.amountDue,
        matchKeyword: invoice.matchKeyword,
        customerName: invoice.customerName,
        issueDate: invoice.issueDate,
      }))
      .filter((invoice) => isOpenForAllocation(invoice));
  } catch {
    return [];
  }
}

/** Delivery id from the header wins when Redbark sends one. */
export async function receiveBankFeedDelivery(opts: {
  token: string;
  timestamp: string;
  signature: string;
  deliveryId: string;
  rawBody: string;
  nowMs?: number;
}): Promise<
  | {
      status: 200;
      added: number;
      skipped: number;
      pending: number;
      duplicate: boolean;
      ignored: boolean;
    }
  | { status: 400 | 401 | 404 }
> {
  const config = await readBankFeedConfig();
  if (!isFeedToken(config.token) || config.token !== opts.token) {
    return { status: 404 };
  }
  const verified = verifyRedbarkSignature({
    secret: config.signingSecret,
    timestamp: opts.timestamp,
    signature: opts.signature,
    rawBody: opts.rawBody,
    nowMs: opts.nowMs,
  });
  if (!verified.ok) return { status: 401 };

  let payload: unknown;
  try {
    payload = JSON.parse(opts.rawBody || "null");
  } catch {
    return { status: 400 };
  }
  const parsed = redbarkFeedRows(payload);
  const id = String(opts.deliveryId || parsed.deliveryId || "").trim();
  if (id && config.seenDeliveryIds.includes(id)) {
    return {
      status: 200,
      added: 0,
      skipped: 0,
      pending: parsed.pending,
      duplicate: true,
      ignored: parsed.eventType !== "transactions.synced",
    };
  }
  if (parsed.eventType !== "transactions.synced") {
    await markDelivery(config, id);
    return {
      status: 200,
      added: 0,
      skipped: 0,
      pending: 0,
      duplicate: false,
      ignored: true,
    };
  }

  let accounts = await readBankAccounts();
  const groups = new Map<string, { name: string; rows: string[][] }>();
  for (const row of parsed.rows) {
    const choice = matchFeedBankAccount(accounts, config.accountMap, row);
    if (choice.create) {
      accounts = [
        ...accounts,
        {
          id: choice.create.id,
          name: choice.create.name,
          accountNumber: "",
          bsb: "",
          openingBalance: 0,
          openingAsAt: "2025-07-01",
          type: "Cheque",
        },
      ];
      await writeBankAccounts(accounts);
    }
    config.accountMap[row.accountKey] = choice.bankAccountId;
    const bucket = groups.get(choice.bankAccountId) || {
      name: choice.bankAccountName,
      rows: [],
    };
    bucket.rows.push([row.date, row.amount.toFixed(2), row.description]);
    groups.set(choice.bankAccountId, bucket);
  }

  const invoices = groups.size ? await openInvoiceCandidates() : [];
  let added = 0;
  let skipped = 0;
  for (const [bankAccountId, bucket] of groups) {
    const result = await addRowsToImportBatch({
      rows: bucket.rows,
      bankAccountId,
      bankAccountName: bucket.name,
      invoices,
    });
    added += result.added;
    skipped += result.skipped;
  }

  await markDelivery(config, id);
  return {
    status: 200,
    added,
    skipped,
    pending: parsed.pending,
    duplicate: false,
    ignored: false,
  };
}

async function markDelivery(config: BankFeedConfig, id: string) {
  if (id) {
    config.seenDeliveryIds = [...config.seenDeliveryIds, id].slice(
      -MAX_SEEN_DELIVERIES
    );
  }
  await writeBankFeedConfig(config);
}
