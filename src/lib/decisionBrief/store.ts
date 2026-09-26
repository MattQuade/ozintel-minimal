/**
 * Decision Brief silo — energy profile, scheme updates, retailer connections.
 */

import { promises as fs } from "fs";
import { randomBytes } from "crypto";
import {
  getDecisionBriefDataDir,
  getDecisionBriefGlobalDir,
  getDecisionBriefInstallersPath,
  getDecisionBriefRetailersPath,
  getDecisionBriefStorePath,
} from "@/lib/dataPaths";
import { getDataOwnerEmail } from "@/lib/dataOwnerContext";
import { readLedger, type LedgerEntry } from "@/lib/accounting/store";

export type EnergyBand = "low" | "medium" | "high" | "unknown";

export type EnergyProfile = {
  updatedAt: string;
  monthsCovered: number;
  totalSpendAud: number;
  averageMonthlyAud: number;
  band: EnergyBand;
  retailersSeen: string[];
  entryCount: number;
};

export type SchemeUpdate = {
  id: string;
  /** Stable source key (e.g. energy-gov-cheaper-home-batteries). */
  sourceId?: string;
  source: string;
  title: string;
  url: string;
  snippet: string;
  fetchedAt: string;
  /** ok = page fetched; error = unreachable / HTTP failure (do not sticky-headline). */
  status?: "ok" | "error";
};

export type RetailerConnection = {
  id: string;
  retailerName: string;
  contactEmail: string;
  status: "pending" | "active" | "revoked";
  apiKey: string;
  connectedAt: string;
  lastPushAt?: string;
};

/** Solar / battery installer (not the power retailer). */
export type InstallerConnection = {
  id: string;
  installerName: string;
  contactEmail: string;
  status: "pending" | "active" | "revoked";
  apiKey: string;
  connectedAt: string;
  lastPushAt?: string;
};

export type DecisionBriefStore = {
  connectCode: string;
  energy: EnergyProfile | null;
  schemeUpdates: SchemeUpdate[];
  retailerConnections: RetailerConnection[];
  installerConnections: InstallerConnection[];
  /** Retailer-pushed bill snapshots (kWh / $). */
  retailerBills: Array<{
    id: string;
    retailerId: string;
    periodStart?: string;
    periodEnd?: string;
    amountAud?: number;
    kwh?: number;
    tariffNote?: string;
    receivedAt: string;
  }>;
  /** Installer-pushed quotes / proposals. */
  installerQuotes: Array<{
    id: string;
    installerId: string;
    solarKw?: number;
    batteryKwh?: number;
    quoteAud?: number;
    paybackYears?: number;
    notes?: string;
    receivedAt: string;
  }>;
  brief: {
    headline: string;
    bottomLine: string[];
    figures: Array<{ label: string; value: string }>;
    whatChanged: string;
    nextAction: string;
    asOf: string;
  } | null;
};

export type GlobalRetailer = {
  id: string;
  name: string;
  contactEmail: string;
  createdAt: string;
};

export type GlobalInstaller = {
  id: string;
  name: string;
  contactEmail: string;
  createdAt: string;
};

const ENERGY_ACCOUNT_CODES = new Set(["1331", "1358"]); // Electricity, Gas
const ENERGY_NAME_RE =
  /\b(electric|electricity|origin\s*energy|agl|energy\s*australia|blue\s*nrg|red\s*energy|alinta|power|kwh|gas\b|elgas|supagas)\b/i;

function emptyStore(): DecisionBriefStore {
  return {
    connectCode: randomBytes(3).toString("hex").toUpperCase(),
    energy: null,
    schemeUpdates: [],
    retailerConnections: [],
    installerConnections: [],
    retailerBills: [],
    installerQuotes: [],
    brief: null,
  };
}

async function ensureDirs() {
  await fs.mkdir(getDecisionBriefDataDir(), { recursive: true });
  await fs.mkdir(getDecisionBriefGlobalDir(), { recursive: true });
}

export async function readDecisionBriefStore(): Promise<DecisionBriefStore> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(getDecisionBriefStorePath(), "utf8");
    const parsed = JSON.parse(raw || "{}") as Partial<DecisionBriefStore>;
    return {
      ...emptyStore(),
      ...parsed,
      connectCode:
        String(parsed.connectCode || "").trim() || emptyStore().connectCode,
      schemeUpdates: Array.isArray(parsed.schemeUpdates)
        ? parsed.schemeUpdates
        : [],
      retailerConnections: Array.isArray(parsed.retailerConnections)
        ? parsed.retailerConnections
        : [],
      installerConnections: Array.isArray(parsed.installerConnections)
        ? parsed.installerConnections
        : [],
      retailerBills: Array.isArray(parsed.retailerBills)
        ? parsed.retailerBills
        : [],
      installerQuotes: Array.isArray(parsed.installerQuotes)
        ? parsed.installerQuotes
        : [],
      brief: parsed.brief || null,
      energy: parsed.energy || null,
    };
  } catch {
    const store = emptyStore();
    await writeDecisionBriefStore(store);
    return store;
  }
}

export async function writeDecisionBriefStore(
  store: DecisionBriefStore
): Promise<void> {
  await ensureDirs();
  const target = getDecisionBriefStorePath();
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  try {
    await fs.rename(tmp, target);
  } catch {
    await fs.copyFile(tmp, target);
    await fs.unlink(tmp).catch(() => undefined);
  }
}

function isEnergyEntry(e: LedgerEntry): boolean {
  const code = String(e.accountCode || "").trim();
  if (ENERGY_ACCOUNT_CODES.has(code)) return true;
  const hay = [
    e.description,
    e.accountName,
    e.account,
    e.category,
  ]
    .map((x) => String(x || ""))
    .join(" ");
  return ENERGY_NAME_RE.test(hay);
}

function bandFromMonthly(avg: number): EnergyBand {
  if (!(avg > 0)) return "unknown";
  if (avg < 400) return "low";
  if (avg < 1200) return "medium";
  return "high";
}

/** Pull electricity/gas spend from the accounting ledger into Decision Brief. */
export async function refreshEnergyFromAccounting(): Promise<EnergyProfile> {
  const ledger = await readLedger();
  const energy = ledger.filter(isEnergyEntry);
  const byMonth = new Map<string, number>();
  const retailers = new Set<string>();

  for (const e of energy) {
    const date = String(e.date || "").slice(0, 7);
    if (!date) continue;
    const amt = Math.abs(Number(e.amount) || 0);
    byMonth.set(date, (byMonth.get(date) || 0) + amt);
    const desc = String(e.description || "").trim();
    if (desc) retailers.add(desc.split(/\s+/).slice(0, 3).join(" "));
  }

  const months = [...byMonth.keys()].sort();
  const total = [...byMonth.values()].reduce((a, b) => a + b, 0);
  const monthsCovered = Math.max(months.length, 1);
  const averageMonthlyAud =
    months.length > 0 ? Math.round((total / months.length) * 100) / 100 : 0;
  const profile: EnergyProfile = {
    updatedAt: new Date().toISOString(),
    monthsCovered: months.length,
    totalSpendAud: Math.round(total * 100) / 100,
    averageMonthlyAud,
    band: bandFromMonthly(averageMonthlyAud),
    retailersSeen: [...retailers].slice(0, 8),
    entryCount: energy.length,
  };

  const store = await readDecisionBriefStore();
  store.energy = profile;
  store.brief = buildEnergyBrief(store);
  await writeDecisionBriefStore(store);
  return profile;
}

function latestUsefulSchemeUpdate(
  updates: SchemeUpdate[]
): SchemeUpdate | undefined {
  return updates.find(
    (u) =>
      u.status === "ok" ||
      (!u.status &&
        !/unreachable|fetch failed|unteachable/i.test(String(u.title || "")))
  );
}

export function buildEnergyBrief(store: DecisionBriefStore): NonNullable<
  DecisionBriefStore["brief"]
> {
  const energy = store.energy;
  const latestUpdate = latestUsefulSchemeUpdate(store.schemeUpdates);
  const asOf = new Date().toISOString().slice(0, 10);
  const avg = energy?.averageMonthlyAud ?? 0;
  const band = energy?.band || "unknown";

  let verdict =
    "Not enough power data yet — connect a retailer/installer or import bills.";
  let next =
    "Share your Decision Brief code with your energy retailer and a solar/battery installer, or import bank CSV so electricity posts to the ledger.";
  if (band === "low") {
    verdict =
      "At this spend level, solar + battery under current small-business settings is often marginal — check tariff and roof first.";
    next =
      "Get one firm installer quote sized to daytime load; compare to your last 12 months average.";
  } else if (band === "medium") {
    verdict =
      "Medium usage: solar is often worth modelling; battery depends on peak tariff and rebate band.";
    next =
      "Ask your retailer for 12 months kWh + peak share, then request installer quotes.";
  } else if (band === "high") {
    verdict =
      "High power spend: solar + battery is more likely to pay back under the current scheme — model urgently.";
    next =
      "Connect retailer usage and an installer quote this week before scheme settings move.";
  }

  const activeInstallers = store.installerConnections.filter(
    (c) => c.status === "active"
  ).length;
  const latestQuote = store.installerQuotes[0];

  const figures: Array<{ label: string; value: string }> = [
    {
      label: "Avg monthly power (ledger)",
      value: energy ? `$${energy.averageMonthlyAud.toFixed(2)}` : "—",
    },
    {
      label: "Months of data",
      value: energy ? String(energy.monthsCovered) : "0",
    },
    {
      label: "Usage band",
      value: band,
    },
    {
      label: "Retailer links",
      value: String(
        store.retailerConnections.filter((c) => c.status === "active").length
      ),
    },
    {
      label: "Installer links",
      value: String(activeInstallers),
    },
  ];

  if (latestQuote?.quoteAud != null) {
    figures.push({
      label: "Latest installer quote",
      value: `$${Number(latestQuote.quoteAud).toFixed(0)}`,
    });
  }

  if (energy && energy.totalSpendAud > 0) {
    figures.push({
      label: "Total in window",
      value: `$${energy.totalSpendAud.toFixed(2)}`,
    });
  }

  return {
    headline: "Solar + battery: worth it for your power spend?",
    bottomLine: [
      verdict,
      energy?.retailersSeen?.length
        ? `Seen on ledger: ${energy.retailersSeen.slice(0, 3).join(", ")}`
        : "No named retailers on the ledger yet.",
      activeInstallers
        ? `${activeInstallers} installer${activeInstallers === 1 ? "" : "s"} connected${
            latestQuote?.solarKw
              ? ` · latest ${latestQuote.solarKw} kW solar`
              : ""
          }`
        : "No solar/battery installer connected yet.",
      latestUpdate
        ? `Latest scan: ${latestUpdate.title}`
        : "Scheme scan has not run yet.",
    ],
    figures,
    whatChanged: latestUpdate
      ? `${latestUpdate.title} (${latestUpdate.source}, ${latestUpdate.fetchedAt.slice(0, 10)})`
      : "No scheme updates scanned yet — the update agent will fill this.",
    nextAction: next,
    asOf,
  };
}

export async function rotateConnectCode(): Promise<string> {
  const store = await readDecisionBriefStore();
  store.connectCode = randomBytes(3).toString("hex").toUpperCase();
  await writeDecisionBriefStore(store);
  return store.connectCode;
}

export async function readGlobalRetailers(): Promise<GlobalRetailer[]> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(getDecisionBriefRetailersPath(), "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeGlobalRetailers(list: GlobalRetailer[]): Promise<void> {
  await ensureDirs();
  await fs.writeFile(
    getDecisionBriefRetailersPath(),
    JSON.stringify(list, null, 2),
    "utf8"
  );
}

/** Map connect code → owner email (global index for retailer form). */
function connectIndexPath() {
  return `${getDecisionBriefGlobalDir()}/connect-index.json`;
}

export async function publishConnectCodeIndex(
  code: string,
  ownerEmail: string
): Promise<void> {
  await ensureDirs();
  let index: Record<string, string> = {};
  try {
    index = JSON.parse(await fs.readFile(connectIndexPath(), "utf8"));
  } catch {
    index = {};
  }
  // Drop old codes for this owner
  for (const [k, v] of Object.entries(index)) {
    if (v === ownerEmail) delete index[k];
  }
  index[code.toUpperCase()] = ownerEmail.toLowerCase();
  await fs.writeFile(connectIndexPath(), JSON.stringify(index, null, 2), "utf8");
}

export async function lookupOwnerByConnectCode(
  code: string
): Promise<string | null> {
  try {
    const index = JSON.parse(await fs.readFile(connectIndexPath(), "utf8")) as
      | Record<string, string>;
    return index[String(code || "").trim().toUpperCase()] || null;
  } catch {
    return null;
  }
}

export async function ensureConnectCodePublished(): Promise<string> {
  const store = await readDecisionBriefStore();
  const owner = getDataOwnerEmail();
  if (owner) await publishConnectCodeIndex(store.connectCode, owner);
  return store.connectCode;
}

export async function acceptRetailerConnect(input: {
  connectCode: string;
  retailerName: string;
  contactEmail: string;
}): Promise<{ ownerEmail: string; connection: RetailerConnection }> {
  const ownerEmail = await lookupOwnerByConnectCode(input.connectCode);
  if (!ownerEmail) {
    throw new Error("Invalid connect code — ask the business for a fresh code");
  }
  const { runWithDataOwnerAsync } = await import("@/lib/dataOwnerContext");
  return runWithDataOwnerAsync(ownerEmail, async () => {
    const store = await readDecisionBriefStore();
    if (
      store.connectCode.toUpperCase() !==
      String(input.connectCode || "").trim().toUpperCase()
    ) {
      throw new Error("Connect code expired — ask for a new one");
    }
    const connection: RetailerConnection = {
      id: `rc_${Date.now().toString(36)}`,
      retailerName: String(input.retailerName || "").trim(),
      contactEmail: String(input.contactEmail || "").trim().toLowerCase(),
      status: "active",
      apiKey: `dbk_${randomBytes(18).toString("hex")}`,
      connectedAt: new Date().toISOString(),
    };
    store.retailerConnections = [
      ...store.retailerConnections.filter(
        (c) =>
          !(
            c.contactEmail === connection.contactEmail &&
            c.retailerName.toLowerCase() ===
              connection.retailerName.toLowerCase()
          )
      ),
      connection,
    ];
    store.brief = buildEnergyBrief(store);
    await writeDecisionBriefStore(store);

    const retailers = await readGlobalRetailers();
    if (
      !retailers.some(
        (r) => r.contactEmail === connection.contactEmail
      )
    ) {
      retailers.push({
        id: connection.id,
        name: connection.retailerName,
        contactEmail: connection.contactEmail,
        createdAt: connection.connectedAt,
      });
      await writeGlobalRetailers(retailers);
    }

    return { ownerEmail, connection };
  });
}

export async function findConnectionByApiKey(
  apiKey: string
): Promise<{ ownerEmail: string; connection: RetailerConnection } | null> {
  const key = String(apiKey || "").trim();
  if (!key) return null;
  let index: Record<string, string> = {};
  try {
    index = JSON.parse(await fs.readFile(connectIndexPath(), "utf8"));
  } catch {
    return null;
  }
  const owners = [...new Set(Object.values(index))];
  const { runWithDataOwnerAsync } = await import("@/lib/dataOwnerContext");
  for (const ownerEmail of owners) {
    const hit = await runWithDataOwnerAsync(ownerEmail, async () => {
      const store = await readDecisionBriefStore();
      const connection = store.retailerConnections.find(
        (c) => c.apiKey === key && c.status === "active"
      );
      return connection || null;
    });
    if (hit) return { ownerEmail, connection: hit };
  }
  return null;
}

export async function pushRetailerBill(input: {
  apiKey: string;
  periodStart?: string;
  periodEnd?: string;
  amountAud?: number;
  kwh?: number;
  tariffNote?: string;
}): Promise<void> {
  const found = await findConnectionByApiKey(input.apiKey);
  if (!found) throw new Error("Invalid retailer API key");
  const { runWithDataOwnerAsync } = await import("@/lib/dataOwnerContext");
  await runWithDataOwnerAsync(found.ownerEmail, async () => {
    const store = await readDecisionBriefStore();
    const bill = {
      id: `bill_${Date.now().toString(36)}`,
      retailerId: found.connection.id,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      amountAud: input.amountAud,
      kwh: input.kwh,
      tariffNote: input.tariffNote,
      receivedAt: new Date().toISOString(),
    };
    store.retailerBills = [bill, ...store.retailerBills].slice(0, 100);
    store.retailerConnections = store.retailerConnections.map((c) =>
      c.id === found.connection.id
        ? { ...c, lastPushAt: bill.receivedAt }
        : c
    );
    store.brief = buildEnergyBrief(store);
    await writeDecisionBriefStore(store);
  });
}

async function readGlobalInstallers(): Promise<GlobalInstaller[]> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(getDecisionBriefInstallersPath(), "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeGlobalInstallers(list: GlobalInstaller[]): Promise<void> {
  await ensureDirs();
  await fs.writeFile(
    getDecisionBriefInstallersPath(),
    JSON.stringify(list, null, 2),
    "utf8"
  );
}

export async function acceptInstallerConnect(input: {
  connectCode: string;
  installerName: string;
  contactEmail: string;
}): Promise<{ ownerEmail: string; connection: InstallerConnection }> {
  const ownerEmail = await lookupOwnerByConnectCode(input.connectCode);
  if (!ownerEmail) {
    throw new Error("Invalid connect code — ask the business for a fresh code");
  }
  const { runWithDataOwnerAsync } = await import("@/lib/dataOwnerContext");
  return runWithDataOwnerAsync(ownerEmail, async () => {
    const store = await readDecisionBriefStore();
    if (
      store.connectCode.toUpperCase() !==
      String(input.connectCode || "").trim().toUpperCase()
    ) {
      throw new Error("Connect code expired — ask for a new one");
    }
    const connection: InstallerConnection = {
      id: `ic_${Date.now().toString(36)}`,
      installerName: String(input.installerName || "").trim(),
      contactEmail: String(input.contactEmail || "").trim().toLowerCase(),
      status: "active",
      apiKey: `dbi_${randomBytes(18).toString("hex")}`,
      connectedAt: new Date().toISOString(),
    };
    store.installerConnections = [
      ...store.installerConnections.filter(
        (c) =>
          !(
            c.contactEmail === connection.contactEmail &&
            c.installerName.toLowerCase() ===
              connection.installerName.toLowerCase()
          )
      ),
      connection,
    ];
    store.brief = buildEnergyBrief(store);
    await writeDecisionBriefStore(store);

    const installers = await readGlobalInstallers();
    if (
      !installers.some((r) => r.contactEmail === connection.contactEmail)
    ) {
      installers.push({
        id: connection.id,
        name: connection.installerName,
        contactEmail: connection.contactEmail,
        createdAt: connection.connectedAt,
      });
      await writeGlobalInstallers(installers);
    }

    return { ownerEmail, connection };
  });
}

export async function findInstallerByApiKey(
  apiKey: string
): Promise<{ ownerEmail: string; connection: InstallerConnection } | null> {
  const key = String(apiKey || "").trim();
  if (!key) return null;
  let index: Record<string, string> = {};
  try {
    index = JSON.parse(await fs.readFile(connectIndexPath(), "utf8"));
  } catch {
    return null;
  }
  const owners = [...new Set(Object.values(index))];
  const { runWithDataOwnerAsync } = await import("@/lib/dataOwnerContext");
  for (const ownerEmail of owners) {
    const hit = await runWithDataOwnerAsync(ownerEmail, async () => {
      const store = await readDecisionBriefStore();
      const connection = store.installerConnections.find(
        (c) => c.apiKey === key && c.status === "active"
      );
      return connection || null;
    });
    if (hit) return { ownerEmail, connection: hit };
  }
  return null;
}

export async function pushInstallerQuote(input: {
  apiKey: string;
  solarKw?: number;
  batteryKwh?: number;
  quoteAud?: number;
  paybackYears?: number;
  notes?: string;
}): Promise<void> {
  const found = await findInstallerByApiKey(input.apiKey);
  if (!found) throw new Error("Invalid installer API key");
  const { runWithDataOwnerAsync } = await import("@/lib/dataOwnerContext");
  await runWithDataOwnerAsync(found.ownerEmail, async () => {
    const store = await readDecisionBriefStore();
    const quote = {
      id: `iq_${Date.now().toString(36)}`,
      installerId: found.connection.id,
      solarKw: input.solarKw,
      batteryKwh: input.batteryKwh,
      quoteAud: input.quoteAud,
      paybackYears: input.paybackYears,
      notes: input.notes,
      receivedAt: new Date().toISOString(),
    };
    store.installerQuotes = [quote, ...store.installerQuotes].slice(0, 100);
    store.installerConnections = store.installerConnections.map((c) =>
      c.id === found.connection.id
        ? { ...c, lastPushAt: quote.receivedAt }
        : c
    );
    store.brief = buildEnergyBrief(store);
    await writeDecisionBriefStore(store);
  });
}

function schemeKey(u: SchemeUpdate): string {
  return String(u.sourceId || u.url || u.source || u.id).toLowerCase();
}

/**
 * Upsert scans by source. A successful fetch replaces a prior unreachable
 * sticky entry for the same page — that was causing "unreachable" to show
 * every time Analysis opened.
 */
export async function appendSchemeUpdates(
  updates: SchemeUpdate[]
): Promise<DecisionBriefStore> {
  const store = await readDecisionBriefStore();
  const byKey = new Map<string, SchemeUpdate>();

  for (const existing of store.schemeUpdates) {
    byKey.set(schemeKey(existing), existing);
  }

  for (const incoming of updates) {
    const key = schemeKey(incoming);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, incoming);
      continue;
    }
    const prevFailed =
      prev.status === "error" ||
      /unreachable|fetch failed|unteachable/i.test(String(prev.title || ""));
    const incomingOk = incoming.status === "ok";
    // Prefer success over failure; otherwise take the newer fetch.
    if (incomingOk || prevFailed || incoming.fetchedAt >= prev.fetchedAt) {
      byKey.set(key, incoming);
    }
  }

  const merged = [...byKey.values()].sort((a, b) => {
    const aOk = a.status !== "error" ? 0 : 1;
    const bOk = b.status !== "error" ? 0 : 1;
    if (aOk !== bOk) return aOk - bOk;
    return String(b.fetchedAt).localeCompare(String(a.fetchedAt));
  });

  store.schemeUpdates = merged.slice(0, 40);
  store.brief = buildEnergyBrief(store);
  await writeDecisionBriefStore(store);
  return store;
}

/** Drop sticky unreachable rows so the brief stops advertising them. */
export async function pruneFailedSchemeUpdates(): Promise<DecisionBriefStore> {
  const store = await readDecisionBriefStore();
  const before = store.schemeUpdates.length;
  store.schemeUpdates = store.schemeUpdates.filter(
    (u) =>
      u.status === "ok" ||
      (!u.status &&
        !/unreachable|fetch failed|unteachable/i.test(String(u.title || "")))
  );
  if (store.schemeUpdates.length !== before) {
    store.brief = buildEnergyBrief(store);
    await writeDecisionBriefStore(store);
  }
  return store;
}
