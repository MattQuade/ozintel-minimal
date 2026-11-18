"use client";

import { useCallback, useEffect, useState } from "react";
import { persistSessionEmailCookie } from "@/lib/client/sessionEmail";

type CoffeeOrder = {
  id: string;
  createdAt: string;
  customerName: string;
  customerNote: string;
  status: string;
  pubReply: string;
  lines: string[];
};

function when(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function CoffeeVanOrdersPage() {
  const [orders, setOrders] = useState<CoffeeOrder[]>([]);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bottleshop/coffee-orders", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        setOrders([]);
        setNeedLogin(res.status === 401 || res.status === 403);
        setStatus(data.error || "Could not load coffee orders.");
        return;
      }
      const next = Array.isArray(data.orders) ? data.orders : [];
      setOrders(next);
      setName(String(data.name || ""));
      setNeedLogin(false);
      setStatus("");
      setDrafts((prev) => {
        const copy = { ...prev };
        for (const order of next) {
          if (copy[order.id] == null) copy[order.id] = order.pubReply || "";
        }
        return copy;
      });
    } catch {
      setStatus("Could not load coffee orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signIn = async () => {
    const query = login.trim();
    if (!query) {
      setStatus("Enter your username.");
      return;
    }
    setStatus("Signing in…");
    try {
      const res = await fetch("/api/bottleshop/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success || !data.user?.email) {
        setStatus(data.error || "No coffee van account found.");
        return;
      }
      persistSessionEmailCookie(data.user.email);
      try {
        localStorage.setItem("ozintel_current_user", JSON.stringify(data.user));
      } catch {
        // ignore
      }
      await load();
    } catch {
      setStatus("Sign in failed.");
    }
  };

  const send = async (id: string) => {
    const reply = String(drafts[id] || "").trim();
    if (!reply) {
      setStatus("Enter a reply.");
      return;
    }
    setSendingId(id);
    setStatus("");
    try {
      const res = await fetch("/api/bottleshop/coffee-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, reply }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        setStatus(data.error || "Could not send the reply.");
        return;
      }
      setStatus(
        data.notified > 0
          ? "Reply sent to their phone."
          : "Reply saved. It shows on their coffee page."
      );
      await load();
    } catch {
      setStatus("Could not send the reply.");
    } finally {
      setSendingId("");
    }
  };

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#0f172a",
        color: "white",
        minHeight: "100vh",
        padding: "calc(20px + env(safe-area-inset-top, 0px)) 16px 48px",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <p style={{ margin: "0 0 8px", color: "#86efac", fontWeight: 700 }}>
          J&S Espresso Bar
        </p>
        <h1 style={{ margin: "0 0 12px", fontSize: "1.6rem" }}>Coffee orders</h1>
        <p style={{ margin: "0 0 16px" }}>
          <a
            href="/bottleshop/coffee"
            style={{
              display: "inline-block",
              color: "#0f172a",
              background: "#e2e8f0",
              textDecoration: "none",
              fontWeight: 600,
              padding: "8px 12px",
              borderRadius: 10,
            }}
          >
            ← Coffee
          </a>
        </p>
        {name ? (
          <p style={{ margin: "0 0 16px", color: "#94a3b8" }}>{name}</p>
        ) : null}

        {needLogin ? (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: "#1e2937",
              border: "1px solid #334155",
            }}
          >
            <p style={{ margin: "0 0 10px", color: "#cbd5e1" }}>
              Sign in with the coffee van username to reply.
            </p>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Username"
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginBottom: 8,
                padding: 12,
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "white",
              }}
            />
            <button
              type="button"
              onClick={() => void signIn()}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "none",
                background: "#b45309",
                color: "white",
                fontWeight: 700,
              }}
            >
              Sign in
            </button>
          </div>
        ) : loading ? (
          <p style={{ color: "#94a3b8" }}>Loading…</p>
        ) : orders.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No coffee orders yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {orders.map((order) => (
              <div
                key={order.id}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  background: "#1e2937",
                  border: "1px solid #334155",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <strong>{order.customerName}</strong>
                  <span style={{ color: "#94a3b8" }}>{when(order.createdAt)}</span>
                </div>
                <p style={{ margin: "8px 0", lineHeight: 1.4 }}>
                  {order.lines.join(", ")}
                </p>
                {order.customerNote ? (
                  <p style={{ margin: "0 0 8px", color: "#cbd5e1" }}>
                    Note: {order.customerNote}
                  </p>
                ) : null}
                <input
                  type="text"
                  value={drafts[order.id] ?? ""}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))
                  }
                  placeholder="Reply, e.g. Ready in 5 minutes"
                  maxLength={240}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    marginBottom: 8,
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid #475569",
                    background: "#0f172a",
                    color: "white",
                  }}
                />
                <button
                  type="button"
                  onClick={() => void send(order.id)}
                  disabled={sendingId === order.id}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: "#b45309",
                    color: "white",
                    fontWeight: 700,
                  }}
                >
                  {sendingId === order.id ? "Sending…" : "Send reply"}
                </button>
              </div>
            ))}
          </div>
        )}
        {status ? (
          <p style={{ margin: "12px 0 0", color: "#93c5fd", lineHeight: 1.4 }}>
            {status}
          </p>
        ) : null}
      </div>
    </main>
  );
}
