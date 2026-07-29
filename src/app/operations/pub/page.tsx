"use client";

import { useCallback, useEffect, useState } from "react";

type KegTotals = {
  totalIn: number;
  totalOut: number;
  net: number;
};

/**
 * Pub Operations — simple keg In / Out / Net only.
 * Stored on persistent disk when OZINTEL_DATA_DIR is set.
 */
export default function PubOperationsPage() {
  const [totals, setTotals] = useState<KegTotals>({
    totalIn: 0,
    totalOut: 0,
    net: 0,
  });
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const loadTotals = useCallback(async () => {
    try {
      const res = await fetch("/api/operations/pub/kegs");
      const data = await res.json();
      if (data.success) {
        setTotals({
          totalIn: data.totalIn || 0,
          totalOut: data.totalOut || 0,
          net: data.net || 0,
        });
      }
    } catch (error) {
      console.error(error);
      setStatus("Failed to load keg totals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTotals();
  }, [loadTotals]);

  async function record(type: "in" | "out") {
    const raw = prompt(
      type === "in" ? "How many kegs came in?" : "How many kegs went out?"
    );
    if (raw == null || !raw.trim()) return;
    const quantity = Number(raw);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert("Please enter a positive number.");
      return;
    }

    setStatus(type === "in" ? "Recording kegs in..." : "Recording kegs out...");
    try {
      const res = await fetch("/api/operations/pub/kegs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, quantity }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to update kegs.");
        setStatus("");
        return;
      }
      setTotals({
        totalIn: data.totalIn || 0,
        totalOut: data.totalOut || 0,
        net: data.net || 0,
      });
      setStatus(type === "in" ? "✅ Kegs in recorded." : "✅ Kegs out recorded.");
    } catch (error) {
      console.error(error);
      alert("Network error updating kegs.");
      setStatus("");
    }
  }

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
        <a href="/" style={{ color: "#38bdf8" }}>
          ← Back to Alerts
        </a>
      </p>

      <h1 style={{ color: "#3b82f6", marginBottom: 8 }}>Pub Operations</h1>
      <p style={{ color: "#94a3b8", marginTop: 0 }}>Keg Tracker</p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          margin: "28px auto",
          maxWidth: 400,
        }}
      >
        <button
          type="button"
          onClick={() => record("in")}
          style={{
            width: "100%",
            padding: 18,
            fontSize: "1.2rem",
            fontWeight: "bold",
            border: "none",
            borderRadius: 12,
            cursor: "pointer",
            background: "#22c55e",
            color: "white",
          }}
        >
          Kegs In
        </button>
        <button
          type="button"
          onClick={() => record("out")}
          style={{
            width: "100%",
            padding: 18,
            fontSize: "1.2rem",
            fontWeight: "bold",
            border: "none",
            borderRadius: 12,
            cursor: "pointer",
            background: "#ef4444",
            color: "white",
          }}
        >
          Kegs Out
        </button>
      </div>

      <div
        style={{
          background: "#1e2937",
          border: "1px solid #334155",
          borderRadius: 12,
          padding: 20,
          maxWidth: 400,
          margin: "0 auto",
          textAlign: "left",
          fontFamily: "ui-monospace, monospace",
          fontSize: "1.15rem",
        }}
      >
        {loading ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>Loading…</p>
        ) : (
          <>
            <p style={{ margin: "0 0 8px" }}>
              In: <strong style={{ color: "#4ade80" }}>{totals.totalIn}</strong>
            </p>
            <p style={{ margin: "0 0 8px" }}>
              Out:{" "}
              <strong style={{ color: "#f87171" }}>{totals.totalOut}</strong>
            </p>
            <p style={{ margin: 0 }}>
              Net: <strong style={{ color: "#38bdf8" }}>{totals.net}</strong>
            </p>
          </>
        )}
      </div>

      <p style={{ color: "#22c55e", minHeight: 28, marginTop: 16 }}>{status}</p>
    </main>
  );
}
