"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { clearBottleShopNotifications } from "@/lib/client/bottleShopPush";

/** Registers owner OzIntel /sw.js (skipped on customer /bottleshop). */
export default function RegisterServiceWorker() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Customer bottle-shop PWA uses /bottleshop/sw.js instead.
    if (pathname?.startsWith("/bottleshop")) return;

    let cancelled = false;
    const register = () => {
      if (cancelled) return;
      void navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("[sw register]", err);
      });
    };

    // Keep SW off the cold-open critical path on phones.
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    const w = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number }
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(register, { timeout: 3000 });
    } else {
      timeoutId = window.setTimeout(register, 1200);
    }

    const dismiss = () => {
      void clearBottleShopNotifications();
    };

    // Defer notification clear slightly so first paint wins.
    const dismissTimer = window.setTimeout(dismiss, 400);
    const onVisible = () => {
      if (document.visibilityState === "visible") dismiss();
    };
    window.addEventListener("focus", dismiss);
    window.addEventListener("pageshow", dismiss);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (idleId != null) w.cancelIdleCallback?.(idleId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
      window.clearTimeout(dismissTimer);
      window.removeEventListener("focus", dismiss);
      window.removeEventListener("pageshow", dismiss);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);
  return null;
}
