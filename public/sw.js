/* OzIntel service worker — bottle shop push + app icon badge */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function setBadge(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  try {
    if (n <= 0) {
      if (self.navigator?.clearAppBadge) await self.navigator.clearAppBadge();
    } else if (self.navigator?.setAppBadge) {
      await self.navigator.setAppBadge(n);
    }
  } catch (err) {
    console.error("[sw badge]", err);
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "OzIntel Bottle Shop";
  const body = data.body || "New bottle shop order";
  const url = data.url || "/operations/pub/bottleshop";
  const badgeCount =
    data.badgeCount != null ? Number(data.badgeCount) : 1;

  event.waitUntil(
    (async () => {
      await setBadge(badgeCount);
      await self.registration.showNotification(title, {
        body,
        icon: "/icons/icon-192.png?v=10",
        badge: "/icons/icon-192.png?v=10",
        data: { url },
        tag: "bottleshop-order",
        renotify: true,
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/operations/pub/bottleshop";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              // ignore navigate failures
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SET_BADGE") {
    event.waitUntil(setBadge(data.count));
  }
  if (data.type === "CLEAR_BADGE") {
    event.waitUntil(setBadge(0));
  }
});
