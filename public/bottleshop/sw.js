/* Customer bottle-shop PWA — installability only (no offline cache).
 *
 * Do NOT intercept fetch. A pass-through fetch handler turns brief phone
 * network / TLS blips into hard blank-page failures.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      // Drop any old caches from earlier bottle-shop SW experiments.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    })()
  );
});
