"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone = Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone
  );
  return Boolean(mq || iosStandalone);
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Lets customers install a bottle-shop-only home-screen app
 * (separate from the full OzIntel PWA).
 */
export default function BottleShopInstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [installed, setInstalled] = useState(false);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const ios = useMemo(() => isIos(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandaloneDisplay()) {
      setInstalled(true);
      return;
    }

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/bottleshop/sw.js", { scope: "/bottleshop" })
        .catch((err) => console.error("[bottleshop sw]", err));
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      setHint("Added to your home screen.");
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <p style={{ margin: "0 0 16px", color: "#86efac", fontSize: "0.95rem" }}>
        Bottle Shop is installed on this device.
      </p>
    );
  }

  return (
    <div
      style={{
        margin: "0 0 20px",
        padding: 14,
        borderRadius: 12,
        background: "#1e2937",
        border: "1px solid #334155",
      }}
    >
      <p style={{ margin: "0 0 10px", color: "#e2e8f0", fontWeight: 600 }}>
        Add Bottle Shop to your phone
      </p>
      <p style={{ margin: "0 0 12px", color: "#94a3b8", fontSize: "0.9rem" }}>
        Home-screen icon opens only this bottle shop — not OzIntel alerts or
        accounting.
      </p>
      {ios ? (
        <p style={{ margin: 0, color: "#fbbf24", fontSize: "0.9rem", lineHeight: 1.45 }}>
          On iPhone: tap Share → <strong>Add to Home Screen</strong>, then open
          the Bottle Shop icon.
        </p>
      ) : (
        <button
          type="button"
          disabled={busy || !deferred}
          onClick={async () => {
            if (!deferred) {
              setHint(
                "Use your browser menu → Install app / Add to Home screen."
              );
              return;
            }
            setBusy(true);
            try {
              await deferred.prompt();
              const choice = await deferred.userChoice;
              if (choice.outcome === "accepted") {
                setInstalled(true);
                setHint("Added to your home screen.");
              } else {
                setHint("Install dismissed — you can try again anytime.");
              }
            } catch (error) {
              setHint(
                error instanceof Error ? error.message : "Install failed"
              );
            } finally {
              setDeferred(null);
              setBusy(false);
            }
          }}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "none",
            background: deferred ? "#b45309" : "#475569",
            color: "white",
            fontWeight: 700,
            cursor: deferred ? "pointer" : "default",
          }}
        >
          {busy
            ? "Opening install…"
            : deferred
              ? "Install Bottle Shop app"
              : "Install available in browser menu"}
        </button>
      )}
      {hint ? (
        <p style={{ margin: "10px 0 0", color: "#93c5fd", fontSize: "0.9rem" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
