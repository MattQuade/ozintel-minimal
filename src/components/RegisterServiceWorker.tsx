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

    void navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[sw register]", err);
    });

    const dismiss = () => {
      void clearBottleShopNotifications();
    };

    dismiss();
    const onVisible = () => {
      if (document.visibilityState === "visible") dismiss();
    };
    window.addEventListener("focus", dismiss);
    window.addEventListener("pageshow", dismiss);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("focus", dismiss);
      window.removeEventListener("pageshow", dismiss);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);
  return null;
}
