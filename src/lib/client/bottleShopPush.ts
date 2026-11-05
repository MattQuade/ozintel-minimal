/** Client helpers for bottle-shop web push + app badge. */

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser.");
  }
  return navigator.serviceWorker.register("/sw.js");
}

export async function syncAppBadge(count: number) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  try {
    if (n <= 0) {
      if (navigator.clearAppBadge) await navigator.clearAppBadge();
    } else if (navigator.setAppBadge) {
      await navigator.setAppBadge(n);
    }
  } catch {
    // Badging unsupported on this device
  }
  const reg = await navigator.serviceWorker?.getRegistration();
  reg?.active?.postMessage({ type: "SET_BADGE", count: n });
}

/** Close bottle-shop tray notifications when the user opens the app. */
export async function clearBottleShopNotifications() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg =
      (await navigator.serviceWorker.getRegistration()) ||
      (await navigator.serviceWorker.ready.catch(() => null));
    if (!reg) return;

    if (typeof reg.getNotifications === "function") {
      const list = await reg.getNotifications({ tag: "bottleshop-order" });
      for (const n of list) n.close();
    }

    const worker = reg.active || navigator.serviceWorker.controller;
    worker?.postMessage({ type: "APP_OPENED" });
    worker?.postMessage({
      type: "CLEAR_NOTIFICATIONS",
      tag: "bottleshop-order",
    });
  } catch (err) {
    console.error("[clear notifications]", err);
  }
}

export async function enableBottleShopPush(): Promise<string> {
  const reg = await ensureServiceWorker();
  await navigator.serviceWorker.ready;

  if (!("PushManager" in window) || !("Notification" in window)) {
    throw new Error(
      "Push notifications are not supported here. Use an installed home-screen OzIntel app (iOS 16.4+ or Android Chrome)."
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const vapidRes = await fetch("/api/push/vapid");
  const vapid = await vapidRes.json();
  if (!vapid.success || !vapid.publicKey) {
    throw new Error(vapid.error || "Could not load push keys.");
  }

  const existing = await reg.pushManager.getSubscription();
  const subscription =
    existing ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
    }));

  const saveRes = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  const saved = await saveRes.json();
  if (!saved.success) {
    throw new Error(saved.error || "Could not save push subscription.");
  }
  return subscription.endpoint;
}
