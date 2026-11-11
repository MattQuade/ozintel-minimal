"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const VoiceHandsfreeDock = dynamic(() => import("./VoiceHandsfreeDock"), {
  ssr: false,
});

/**
 * Keep voice chrome off the phone cold-open path. Load after first paint /
 * idle so the PWA can become interactive sooner.
 */
export default function DeferredVoiceHandsfreeDock() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const enable = () => {
      if (!cancelled) setReady(true);
    };

    const w = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number }
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(enable, { timeout: 2000 });
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
      };
    }

    const t = window.setTimeout(enable, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  if (!ready) return null;
  return <VoiceHandsfreeDock />;
}
