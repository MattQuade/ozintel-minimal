import { promises as fs } from "fs";
import path from "path";
import webpush, { type PushSubscription } from "web-push";
import { getDataDir } from "@/lib/dataPaths";
import { configureWebPush } from "@/lib/push/vapid";

export type StoredPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  ownerEmail: string;
  /** Bottle shop login this phone should hear replies for. Not a phone number. */
  customerId?: string;
  createdAt: string;
  userAgent?: string;
};

type Store = { subscriptions: StoredPushSubscription[] };

function storePath() {
  return path.join(getDataDir(), "push-subscriptions.json");
}

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw || "{}") as Partial<Store>;
    return {
      subscriptions: Array.isArray(parsed.subscriptions)
        ? parsed.subscriptions
        : [],
    };
  } catch {
    return { subscriptions: [] };
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify(store, null, 2), "utf8");
}

function normalizeSub(raw: unknown, ownerEmail: string): StoredPushSubscription | null {
  if (!raw || typeof raw !== "object") return null;
  const sub = raw as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  const endpoint = String(sub.endpoint || "").trim();
  const p256dh = String(sub.keys?.p256dh || "").trim();
  const auth = String(sub.keys?.auth || "").trim();
  if (!endpoint || !p256dh || !auth) return null;
  return {
    endpoint,
    keys: { p256dh, auth },
    ownerEmail: ownerEmail.trim().toLowerCase(),
    createdAt: new Date().toISOString(),
  };
}

export async function savePushSubscription(
  raw: unknown,
  ownerEmail: string,
  userAgent?: string
): Promise<StoredPushSubscription> {
  const next = normalizeSub(raw, ownerEmail);
  if (!next) throw new Error("Invalid push subscription");
  if (userAgent) next.userAgent = userAgent.slice(0, 240);

  const store = await readStore();
  const idx = store.subscriptions.findIndex((s) => s.endpoint === next.endpoint);
  if (idx >= 0) store.subscriptions[idx] = { ...store.subscriptions[idx], ...next };
  else store.subscriptions.push(next);
  await writeStore(store);
  return next;
}

export async function removePushSubscription(endpoint: string) {
  const store = await readStore();
  const before = store.subscriptions.length;
  store.subscriptions = store.subscriptions.filter((s) => s.endpoint !== endpoint);
  if (store.subscriptions.length !== before) await writeStore(store);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  badgeCount?: number;
  tag?: string;
};

async function sendToSubscriptions(
  targets: StoredPushSubscription[],
  others: StoredPushSubscription[],
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  if (!targets.length) return { sent: 0, failed: 0 };
  await configureWebPush();
  let sent = 0;
  let failed = 0;
  const keep: StoredPushSubscription[] = [];
  for (const sub of targets) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: sub.keys,
    } as PushSubscription;
    try {
      await webpush.sendNotification(pushSub, JSON.stringify(payload), {
        TTL: 60 * 60,
      });
      sent += 1;
      keep.push(sub);
    } catch (err) {
      failed += 1;
      const status =
        err && typeof err === "object" && "statusCode" in err
          ? Number((err as { statusCode?: number }).statusCode)
          : 0;
      if (status !== 404 && status !== 410) keep.push(sub);
      console.error("[push send]", status || err);
    }
  }
  await writeStore({ subscriptions: [...others, ...keep] });
  return { sent, failed };
}

export async function sendPushToOwner(
  ownerEmail: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const email = ownerEmail.trim().toLowerCase();
  const store = await readStore();
  return sendToSubscriptions(
    store.subscriptions.filter((s) => s.ownerEmail === email),
    store.subscriptions.filter((s) => s.ownerEmail !== email),
    payload
  );
}

/** Ping the bottle shop login on this phone. Does not use a phone number. */
export async function saveCustomerPushSubscription(
  raw: unknown,
  customerId: string,
  userAgent?: string
): Promise<StoredPushSubscription> {
  const id = customerId.trim().toLowerCase();
  if (!id) throw new Error("Bottle shop login is required");
  const next = normalizeSub(raw, "");
  if (!next) throw new Error("Invalid push subscription");
  next.customerId = id;
  if (userAgent) next.userAgent = userAgent.slice(0, 240);

  const store = await readStore();
  const idx = store.subscriptions.findIndex((s) => s.endpoint === next.endpoint);
  if (idx >= 0) {
    const prev = store.subscriptions[idx];
    store.subscriptions[idx] = {
      ...prev,
      ...next,
      ownerEmail: prev.ownerEmail || "",
      customerId: id,
    };
  } else {
    store.subscriptions.push(next);
  }
  await writeStore(store);
  return next;
}

export async function sendPushToCustomer(
  customerId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const id = customerId.trim().toLowerCase();
  if (!id) return { sent: 0, failed: 0 };
  const store = await readStore();
  return sendToSubscriptions(
    store.subscriptions.filter(
      (s) => String(s.customerId || "").toLowerCase() === id
    ),
    store.subscriptions.filter(
      (s) => String(s.customerId || "").toLowerCase() !== id
    ),
    payload
  );
}

/** Keep phone alerts attached when an admin renames a username. */
export async function renamePushIdentity(fromEmail: string, toEmail: string): Promise<void> {
  const from = String(fromEmail || "").trim().toLowerCase();
  const to = String(toEmail || "").trim().toLowerCase();
  if (!from || !to || from === to) return;
  const store = await readStore();
  let changed = false;
  for (const sub of store.subscriptions) {
    if (String(sub.ownerEmail || "").trim().toLowerCase() === from) {
      sub.ownerEmail = to;
      changed = true;
    }
    if (String(sub.customerId || "").trim().toLowerCase() === from) {
      sub.customerId = to;
      changed = true;
    }
  }
  if (changed) await writeStore(store);
}
