"use client";

import { useEffect } from "react";

/** Registers /sw.js once so installed PWAs can receive push + badge updates. */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[sw register]", err);
    });
  }, []);
  return null;
}
