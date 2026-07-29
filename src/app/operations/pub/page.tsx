"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

type KegTotals = {
  totalIn: number;
  totalOut: number;
  net: number;
};

type KegEntry = {
  id: string;
  date: string;
  type: "in" | "out";
  quantity: number;
  createdAt: string;
};

function todayLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDay(isoDate: string) {
  try {
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

export default function PubOperationsPage() {
  const [month, setMonth] = useState("");
  const [totals, setTotals] = useState<KegTotals>({
    totalIn: 0,
    totalOut: 0,
    net: 0,
  });
  const [entries, setEntries] = useState<KegEntry[]>([]);
  const [archives, setArchives] = useState<string[]>([]);
  const [archiveMonth, setArchiveMonth] = useState("");
  const [archiveEntries, setArchiveEntries] = useState<KegEntry[]>([]);
  const [archiveTotals, setArchiveTotals] = useState<KegTotals | null>(null);
  const [date, setDate] = useState(todayLocalISO());
  const [quantity, setQuantity] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState("");

  const applyPayload = (data: {
    month?: string;
    totals?: KegTotals;
    entries?: KegEntry[];
    archives?: string[];
  }) => {
    if (data.month) setMonth(data.month);
    if (data.totals) setTotals(data.totals);
    if (data.entries) setEntries(data.entries);
    if (data.archives) setArchives(data.archives);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/operations/pub/kegs");
      const data = await res.json();
      if (data.success) {
        applyPayload(data);
        if (data.archivedPrevious) {
          setStatus(
            `Previous month locked and archived. Now tracking ${data.month}.`
          );
        }
      } else {
        setStatus(data.error || "Failed to load.");
      }
    } catch (error) {
      console.error(error);
      setStatus("Failed to load keg tracker.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleEntries = useMemo(() => {
    if (!filterDate) return entries;
    return entries.filter((e) => e.date === filterDate);
  }, [entries, filterDate]);

  async function addEntry(type: "in" | "out") {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Enter a positive quantity.");
      return;
    }
    if (!date) {
      alert("Choose a date.");
      return;
    }
    setStatus(type === "in" ? "Recording kegs in..." : "Recording kegs out...");
    try {
      const res = await fetch("/api/operations/pub/kegs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, quantity: qty, date }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to add entry.");
        setStatus("");
        return;
      }
      applyPayload(data);
      setQuantity("");
      setStatus(type === "in" ? "✅ Kegs in recorded." : "✅ Kegs out recorded.");
    } catch (error) {
      console.error(error);
      alert("Network error.");
      setStatus("");
    }
  }

  async function adjustEntry(entry: KegEntry) {
    const raw = prompt(`New quantity for ${entry.date} (${entry.type}):`, String(entry.quantity));
    if (raw == null) return;
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Enter a positive quantity.");
      return;
    }
    try {
      const res = await fetch("/api/operations/pub/kegs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to update.");
        return;
      }
      applyPayload(data);
      setStatus("✅ Entry updated.");
    } catch (error) {
      console.error(error);
      alert("Network error.");
    }
  }

  async function removeEntry(entry: KegEntry) {
    if (
      !confirm(
        `Delete ${entry.quantity} keg(s) ${entry.type} on ${formatDay(entry.date)}?`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/operations/pub/kegs?id=${encodeURIComponent(entry.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to delete.");
        return;
      }
      applyPayload(data);
      setStatus("✅ Entry deleted.");
    } catch (error) {
      console.error(error);
      alert("Network error.");
    }
  }

  async function openArchive(m: string) {
    setArchiveMonth(m);
    setArchiveEntries([]);
    setArchiveTotals(null);
    try {
      const res = await fetch(`/api/operations/pub/kegs/archives/${m}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Archive not found.");
        return;
      }
      setArchiveEntries(data.entries || []);
      setArchiveTotals(data.totals || null);
    } catch (error) {
      console.error(error);
      alert("Failed to load archive.");
    }
  }

  const fieldStyle: CSSProperties = {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #475569",
    background: "#0f172a",
    color: "white",
    boxSizing: "border-box",
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
        <a href="/" style={{ color: "#38bdf8" }}>
          ← Back to Alerts
        </a>
      </p>

      <h1 style={{ color: "#3b82f6", marginBottom: 8 }}>Pub Operations</h1>
      <p style={{ color: "#94a3b8", marginTop: 0 }}>
        Keg Tracker {month ? `· ${month}` : ""}
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: 420,
          margin: "20px auto",
          textAlign: "left",
        }}
      >
        <label style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ ...fieldStyle, marginTop: 4 }}
          />
        </label>
        <label style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
          Quantity
          <input
            type="number"
            min={1}
            step={1}
            placeholder="e.g. 3"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{ ...fieldStyle, marginTop: 4 }}
          />
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={() => addEntry("in")}
            style={{
              flex: 1,
              padding: 14,
              fontWeight: "bold",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              background: "#22c55e",
              color: "white",
            }}
          >
            Kegs In
          </button>
          <button
            type="button"
            onClick={() => addEntry("out")}
            style={{
              flex: 1,
              padding: 14,
              fontWeight: "bold",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              background: "#ef4444",
              color: "white",
            }}
          >
            Kegs Out
          </button>
        </div>
      </div>

      <div
        style={{
          background: "#1e2937",
          border: "1px solid #334155",
          borderRadius: 12,
          padding: 16,
          maxWidth: 420,
          margin: "0 auto 20px",
          textAlign: "left",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {loading ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>Loading…</p>
        ) : (
          <>
            <p style={{ margin: "0 0 6px" }}>
              Month In:{" "}
              <strong style={{ color: "#4ade80" }}>{totals.totalIn}</strong>
            </p>
            <p style={{ margin: "0 0 6px" }}>
              Month Out:{" "}
              <strong style={{ color: "#f87171" }}>{totals.totalOut}</strong>
            </p>
            <p style={{ margin: 0 }}>
              Month Net:{" "}
              <strong style={{ color: "#38bdf8" }}>{totals.net}</strong>
            </p>
          </>
        )}
      </div>

      <p style={{ color: "#22c55e", minHeight: 24 }}>{status}</p>

      <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "left" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.15rem", color: "#e2e8f0" }}>
            This month (editable)
          </h2>
          <label style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
            Filter day{" "}
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              style={{
                marginLeft: 6,
                padding: 6,
                borderRadius: 6,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "white",
              }}
            />
          </label>
        </div>
        {filterDate && (
          <button
            type="button"
            onClick={() => setFilterDate("")}
            style={{
              marginBottom: 10,
              background: "transparent",
              border: "1px solid #64748b",
              color: "#94a3b8",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            Clear filter
          </button>
        )}

        {visibleEntries.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No entries yet this month.</p>
        ) : (
          visibleEntries.map((entry) => (
            <div
              key={entry.id}
              style={{
                background: "#1e2937",
                border: "1px solid #334155",
                borderRadius: 10,
                padding: 12,
                marginBottom: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{formatDay(entry.date)}</div>
                <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                  <span
                    style={{
                      color: entry.type === "in" ? "#4ade80" : "#f87171",
                      fontWeight: "bold",
                    }}
                  >
                    {entry.type === "in" ? "IN" : "OUT"}
                  </span>{" "}
                  · {entry.quantity} keg
                  {entry.quantity === 1 ? "" : "s"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => adjustEntry(entry)}
                  style={{
                    background: "#0ea5e9",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 10px",
                    cursor: "pointer",
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => removeEntry(entry)}
                  style={{
                    background: "#dc2626",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 10px",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div
        style={{
          maxWidth: 520,
          margin: "36px auto 20px",
          textAlign: "left",
          borderTop: "1px solid #334155",
          paddingTop: 20,
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: "1.15rem", color: "#e2e8f0" }}>
          Closed months (read-only)
        </h2>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginTop: 0 }}>
          When a new calendar month starts, last month&apos;s rows are locked into
          an archive file on the server and can no longer be edited.
        </p>
        {archives.length === 0 ? (
          <p style={{ color: "#64748b" }}>No archived months yet.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {archives.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => openArchive(m)}
                style={{
                  background: archiveMonth === m ? "#1d4ed8" : "#334155",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {archiveMonth && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ color: "#94a3b8" }}>
              Archive {archiveMonth} 🔒
              {archiveTotals && (
                <span style={{ fontWeight: 400, marginLeft: 8 }}>
                  In {archiveTotals.totalIn} · Out {archiveTotals.totalOut} · Net{" "}
                  {archiveTotals.net}
                </span>
              )}
            </h3>
            {archiveEntries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 6,
                  color: "#cbd5e1",
                }}
              >
                {formatDay(entry.date)} ·{" "}
                <strong
                  style={{
                    color: entry.type === "in" ? "#4ade80" : "#f87171",
                  }}
                >
                  {entry.type.toUpperCase()}
                </strong>{" "}
                · {entry.quantity}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
