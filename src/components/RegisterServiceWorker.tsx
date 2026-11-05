"use client";

import { useEffect } from "react";
import { clearBottleShopNotifications } from "@/lib/client/bottleShopPush";

/** Registers /sw.js and clears on-screen push notices when the app is opened. */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[sw register]", err);
    });

    const dismiss = () => {
      void clearBottleShopNotifications();
    };

    // Opening / returning to the app should clear the tray notification.
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
  }, []);
  return null;
}
