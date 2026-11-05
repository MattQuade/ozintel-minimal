"use client";

import { useCallback, useEffect, useState } from "react";
import OpsGate from "@/components/OpsGate";

type Product = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  active: boolean;
};

type Order = {
  id: string;
  createdAt: string;
  customerName: string;
  customerNote: string;
  lines: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  total: number;
  status: "reserved" | "collected" | "cancelled";
};

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function formatWhen(iso: string) {
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
    return iso;
  }
}

function BottleShopAdminInner() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<
    Record<string, { price: string; quantity: string; name: string }>
  >({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/operations/pub/bottleshop");
      const data = await res.json();
      if (!data.success) {
        setStatus(data.error || "Failed to load.");
        return;
      }
      const nextProducts: Product[] = data.products || [];
      setProducts(nextProducts);
      setOrders(data.orders || []);
      const nextDrafts: Record<
        string,
        { price: string; quantity: string; name: string }
      > = {};
      for (const p of nextProducts) {
        nextDrafts[p.id] = {
          name: p.name,
          price: String(p.price),
          quantity: String(p.quantity),
        };
      }
      setDrafts(nextDrafts);
      setStatus("");
    } catch (error) {
      console.error(error);
      setStatus("Failed to load bottle shop.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveProduct = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setStatus("Saving…");
    try {
      const res = await fetch("/api/operations/pub/bottleshop", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "product",
          id,
          name: draft.name,
          price: Number(draft.price),
          quantity: Number(draft.quantity),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setStatus(data.error || "Save failed");
        return;
      }
      setStatus("Saved.");
      await load();
    } catch (error) {
      console.error(error);
      setStatus("Save failed.");
    }
  };

  const uploadPhoto = async (id: string, file: File | null | undefined) => {
    if (!file) return;
    setStatus(`Uploading photo for ${id}…`);
    try {
      const form = new FormData();
      form.set("productId", id);
      form.set("file", file);
      const res = await fetch("/api/operations/pub/bottleshop/photo", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!data.success) {
        setStatus(data.error || "Photo upload failed");
        return;
      }
      setStatus("Photo uploaded — public bottle shop will show it.");
      await load();
    } catch (error) {
      console.error(error);
      setStatus("Photo upload failed.");
    }
  };

  const setOrderStatus = async (id: string, next: Order["status"]) => {
    try {
      const res = await fetch("/api/operations/pub/bottleshop", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "order", id, status: next }),
      });
      const data = await res.json();
      if (!data.success) {
        setStatus(data.error || "Update failed");
        return;
      }
      await load();
    } catch (error) {
      console.error(error);
      setStatus("Order update failed.");
    }
  };

  return (
    <main
      style={{
        fontFamily: "system-ui",
        background: "#0f172a",
        color: "white",
        minHeight: "100vh",
        padding: 24,
      }}
    >
      <p style={{ margin: "0 0 12px" }}>
        <a href="/operations/pub" style={{ color: "#38bdf8" }}>
          ← Pub Operations
        </a>
        {" · "}
        <a href="/bottleshop" style={{ color: "#fbbf24" }}>
          Public /bottleshop
        </a>
      </p>
      <h1 style={{ color: "#f59e0b", marginTop: 0 }}>Bottle Shop ledger</h1>
      <p style={{ color: "#94a3b8" }}>
        Update stock, prices, and photos. Photos are stored on the server
        (not in git) and show on the public bottle shop. Customer reserves
        write here and text you the bottles + quantities.
      </p>
      {status ? (
        <p style={{ color: "#93c5fd" }}>{status}</p>
      ) : null}
      {loading ? (
        <p style={{ color: "#94a3b8" }}>Loading…</p>
      ) : (
        <>
          <h2 style={{ marginTop: 28 }}>Stock</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {products.map((p) => {
              const draft = drafts[p.id] || {
                name: p.name,
                price: String(p.price),
                quantity: String(p.quantity),
              };
              return (
                <div
                  key={p.id}
                  style={{
                    background: "#1e2937",
                    border: "1px solid #334155",
                    borderRadius: 12,
                    padding: 12,
                    display: "grid",
                    gridTemplateColumns: "64px 1fr",
                    gap: 12,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.imageUrl}
                    alt=""
                    width={64}
                    height={84}
                    style={{
                      width: 64,
                      height: 84,
                      objectFit: "cover",
                      borderRadius: 8,
                    }}
                  />
                  <div>
                    <input
                      value={draft.name}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [p.id]: { ...draft, name: e.target.value },
                        }))
                      }
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        marginBottom: 8,
                        padding: 8,
                        borderRadius: 8,
                        border: "1px solid #475569",
                        background: "#0f172a",
                        color: "white",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                        Price
                        <input
                          type="number"
                          step="0.01"
                          value={draft.price}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [p.id]: { ...draft, price: e.target.value },
                            }))
                          }
                          style={{
                            display: "block",
                            width: 90,
                            marginTop: 4,
                            padding: 8,
                            borderRadius: 8,
                            border: "1px solid #475569",
                            background: "#0f172a",
                            color: "white",
                          }}
                        />
                      </label>
                      <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                        Qty
                        <input
                          type="number"
                          value={draft.quantity}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [p.id]: { ...draft, quantity: e.target.value },
                            }))
                          }
                          style={{
                            display: "block",
                            width: 90,
                            marginTop: 4,
                            padding: 8,
                            borderRadius: 8,
                            border: "1px solid #475569",
                            background: "#0f172a",
                            color: "white",
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => saveProduct(p.id)}
                        style={{
                          marginTop: 18,
                          padding: "10px 14px",
                          borderRadius: 8,
                          border: "none",
                          background: "#1d4ed8",
                          color: "white",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Save
                      </button>
                      <label
                        style={{
                          marginTop: 18,
                          padding: "10px 14px",
                          borderRadius: 8,
                          background: "#b45309",
                          color: "white",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-block",
                        }}
                      >
                        Upload photo
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            void uploadPhoto(p.id, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <h2 style={{ marginTop: 36 }}>Orders</h2>
          {orders.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>No reserves yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {orders.map((o) => (
                <div
                  key={o.id}
                  style={{
                    background: "#1e2937",
                    border: "1px solid #334155",
                    borderRadius: 12,
                    padding: 14,
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
                    <strong>{o.customerName}</strong>
                    <span style={{ color: "#94a3b8" }}>
                      {formatWhen(o.createdAt)}
                    </span>
                  </div>
                  <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
                    {o.lines.map((l) => (
                      <li key={`${o.id}-${l.productId}`}>
                        {l.quantity}× {l.name} ({money(l.unitPrice)})
                      </li>
                    ))}
                  </ul>
                  <p style={{ margin: "0 0 8px" }}>
                    Total {money(o.total)} ·{" "}
                    <span style={{ color: "#fbbf24" }}>{o.status}</span>
                  </p>
                  {o.customerNote ? (
                    <p style={{ color: "#94a3b8", marginTop: 0 }}>
                      Note: {o.customerNote}
                    </p>
                  ) : null}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setOrderStatus(o.id, "collected")}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: "#15803d",
                        color: "white",
                        cursor: "pointer",
                      }}
                    >
                      Collected
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderStatus(o.id, "cancelled")}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: "#7f1d1d",
                        color: "white",
                        cursor: "pointer",
                      }}
                    >
                      Cancelled
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderStatus(o.id, "reserved")}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: "#334155",
                        color: "white",
                        cursor: "pointer",
                      }}
                    >
                      Reserved
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default function BottleShopAdminPage() {
  return (
    <OpsGate permission="pubOps" section="Pub Bottle Shop">
      <BottleShopAdminInner />
    </OpsGate>
  );
}
