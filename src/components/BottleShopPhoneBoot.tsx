"use client";

import { useEffect } from "react";

/**
 * Keep the bottle-shop service worker on the safe (no-fetch) build.
 * Phones that installed an older SW can otherwise fail hard on brief
 * network/TLS blips because the old worker intercepted every request.
 */
export default function BottleShopPhoneBoot() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register("/bottleshop/sw.js", { scope: "/bottleshop" })
      .then((reg) => reg.update())
      .catch((err) => console.error("[bottleshop sw]", err));
  }, []);

  return null;
}
