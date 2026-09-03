"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

type PinStatus = {
  hasPin: boolean;
  unlocked: boolean;
};

export default function AccountingPinLock({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PinStatus | null>(null);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/accounting/pin", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.success) {
          setError(data.error || "Could not check PIN.");
          setStatus({ hasPin: false, unlocked: false });
          return;
        }
        setStatus({
          hasPin: Boolean(data.hasPin),
          unlocked: Boolean(data.unlocked),
        });
      } catch {
        if (!cancelled) {
          setError("Could not check PIN.");
          setStatus({ hasPin: false, unlocked: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!status || busy) return;
    if (!/^\d{4}$/.test(pin)) {
      setError("PIN must be 4 digits.");
      return;
    }
    if (!status.hasPin && pin !== confirm) {
      setError("PINs do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/accounting/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: status.hasPin ? "verify" : "set",
          pin,
          confirm,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || "Could not unlock.");
        return;
      }
      setStatus({ hasPin: true, unlocked: true });
      setPin("");
      setConfirm("");
    } catch {
      setError("Could not unlock. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (status?.unlocked) {
    return <>{children}</>;
  }

  const setting = status ? !status.hasPin : true;
  const field = {
    width: "100%" as const,
    boxSizing: "border-box" as const,
    padding: 16,
    borderRadius: 10,
    border: "1px solid #475569",
    background: "#0f172a",
    color: "white",
    fontSize: "1.6rem",
    letterSpacing: "0.4em",
    textAlign: "center" as const,
  };

  return (
    <main
      style={{
        fontFamily: "system-ui",
        background: "#0f172a",
        color: "white",
        minHeight: "100vh",
        padding: 24,
        textAlign: "center",
      }}
    >
      <p style={{ margin: "0 0 16px" }}>
        <a
          href="/"
          style={{
            display: "inline-block",
            color: "#0f172a",
            background: "#e2e8f0",
            textDecoration: "none",
            fontWeight: 600,
            padding: "10px 16px",
            borderRadius: 10,
          }}
        >
          ← Back to Alerts
        </a>
      </p>
      <h1 style={{ color: "#f97316", marginBottom: 8 }}>
        {status === null ? "Accounting" : setting ? "Set PIN" : "Enter PIN"}
      </h1>
      <p style={{ color: "#94a3b8", maxWidth: 400, margin: "0 auto 20px" }}>
        {status === null
          ? "Checking PIN…"
          : setting
            ? "Choose a 4-digit PIN for Accounting, receipts, and operations on this account. Restore-by-email still unlocks alerts."
            : "Enter your 4-digit PIN to open Accounting, receipts, and operations."}
      </p>
      {status !== null ? (
        <form
          onSubmit={(e) => void submit(e)}
          style={{
            maxWidth: 360,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            pattern="\d{4}"
            value={pin}
            onChange={(e) =>
              setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="••••"
            aria-label={setting ? "New PIN" : "PIN"}
            style={field}
          />
          {setting ? (
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              pattern="\d{4}"
              value={confirm}
              onChange={(e) =>
                setConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="Confirm"
              aria-label="Confirm PIN"
              style={field}
            />
          ) : null}
          {error ? (
            <p role="status" style={{ color: "#fca5a5", fontWeight: 600, margin: 0 }}>
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy || pin.length !== 4 || (setting && confirm.length !== 4)}
            style={{
              padding: 16,
              borderRadius: 12,
              border: "none",
              background: "#ea580c",
              color: "white",
              fontWeight: 700,
              fontSize: "1.1rem",
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Please wait…" : setting ? "Set PIN" : "Unlock"}
          </button>
        </form>
      ) : error ? (
        <p role="status" style={{ color: "#fca5a5", fontWeight: 600 }}>
          {error}
        </p>
      ) : null}
    </main>
  );
}
