"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BottleShopInstallButton from "@/components/BottleShopInstallButton";

type Product = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  active: boolean;
};

type Cart = Record<string, number>;

const CODE_KEY = "ozintel_bottleshop_code";

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function readStoredCode() {
  try {
    return localStorage.getItem(CODE_KEY) || "";
  } catch {
    return "";
  }
}

function writeStoredCode(code: string) {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    // ignore
  }
}

export default function BottleShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [customerName, setCustomerName] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [unlockedName, setUnlockedName] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (code: string) => {
    if (!code.trim()) {
      setProducts([]);
      setUnlockedName("");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/bottleshop/products", {
        headers: { "x-bottleshop-code": code.trim() },
      });
      const data = await res.json();
      if (data.success) {
        setProducts(data.products || []);
        setUnlockedName(data.customer?.name || "");
        setAccessCode(code.trim());
        writeStoredCode(code.trim());
        setStatus("");
      } else {
        setProducts([]);
        setUnlockedName("");
        setAccessCode("");
        writeStoredCode("");
        setStatus(data.error || "Invalid invite code.");
      }
    } catch (error) {
      console.error(error);
      setStatus("Failed to load bottle shop.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = (params.get("code") || "").trim();
    const stored = readStoredCode();
    const initial = fromUrl || stored;
    setCodeInput(initial);
    if (initial) void load(initial);
    else setLoading(false);
  }, [load]);

  const lines = useMemo(() => {
    return products
      .map((p) => ({ product: p, qty: cart[p.id] || 0 }))
      .filter((l) => l.qty > 0);
  }, [products, cart]);

  const cartTotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.qty * l.product.price, 0),
    [lines]
  );

  const setQty = (id: string, next: number, max: number) => {
    const qty = Math.max(0, Math.min(max, Math.floor(next || 0)));
    setCart((prev) => {
      const copy = { ...prev };
      if (qty <= 0) delete copy[id];
      else copy[id] = qty;
      return copy;
    });
  };

  const unlock = async () => {
    setStatus("Checking invite…");
    await load(codeInput.trim());
  };

  const submit = async () => {
    if (!accessCode) {
      setStatus("Enter your invite code first.");
      return;
    }
    if (!lines.length) {
      setStatus("Select at least one bottle.");
      return;
    }
    setSubmitting(true);
    setStatus("Reserving…");
    try {
      const res = await fetch("/api/bottleshop/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bottleshop-code": accessCode,
        },
        body: JSON.stringify({
          accessCode,
          customerName: customerName.trim() || unlockedName || undefined,
          customerNote: customerNote.trim() || undefined,
          items: lines.map((l) => ({
            productId: l.product.id,
            quantity: l.qty,
          })),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setStatus(data.error || "Could not reserve.");
        await load(accessCode);
        return;
      }
      setProducts(data.products || []);
      setCart({});
      const smsNote =
        data.sms?.ok === false
          ? " (stock updated; SMS notify failed — check ops list)"
          : data.sms?.mocked
            ? " (SMS mocked in this environment)"
            : "";
      setStatus(
        `Reserved. Pay & collect at the pub.${smsNote}`
      );
    } catch (error) {
      console.error(error);
      setStatus("Reserve failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!accessCode) {
    return (
      <main
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#0f172a",
          color: "white",
          minHeight: "100vh",
          padding: "20px 16px 48px",
        }}
      >
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <p style={{ margin: "0 0 8px", color: "#94a3b8", fontSize: "0.9rem" }}>
            OzIntel · Pub Bottle Shop
          </p>
          <h1 style={{ margin: "0 0 8px", fontSize: "1.75rem", color: "#f8fafc" }}>
            Bottle Shop
          </h1>
          <p style={{ margin: "0 0 16px", color: "#94a3b8", lineHeight: 1.45 }}>
            Invite only for now. Enter the code from the pub (or open your
            personal link) to see stock and reserve bottles.
          </p>
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: "#1e2937",
              border: "1px solid #334155",
            }}
          >
            <label style={{ display: "block", color: "#94a3b8", marginBottom: 8 }}>
              Invite code
              <input
                type="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. AB12CD"
                style={{
                  display: "block",
                  width: "100%",
                  boxSizing: "border-box",
                  marginTop: 6,
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #475569",
                  background: "#0f172a",
                  color: "white",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => void unlock()}
              style={{
                width: "100%",
                marginTop: 8,
                padding: 14,
                borderRadius: 10,
                border: "none",
                background: "#b45309",
                color: "white",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Open bottle shop
            </button>
            {status ? (
              <p style={{ margin: "12px 0 0", color: "#fca5a5" }}>{status}</p>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#0f172a",
        color: "white",
        minHeight: "100vh",
        padding: "20px 16px 48px",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <p style={{ margin: "0 0 8px", color: "#94a3b8", fontSize: "0.9rem" }}>
          OzIntel · Pub Bottle Shop
          {unlockedName ? ` · ${unlockedName}` : ""}
        </p>
        <h1 style={{ margin: "0 0 8px", fontSize: "1.75rem", color: "#f8fafc" }}>
          Bottle Shop
        </h1>
        <p style={{ margin: "0 0 16px", color: "#94a3b8", lineHeight: 1.45 }}>
          Reserve bottles here — pay and collect at the pub. No online payment
          yet.
        </p>

        <BottleShopInstallButton />

        <p style={{ margin: "0 0 16px" }}>
          <button
            type="button"
            onClick={() => {
              writeStoredCode("");
              setAccessCode("");
              setProducts([]);
              setUnlockedName("");
              setCodeInput("");
              setStatus("");
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#38bdf8",
              padding: 0,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Switch invite code
          </button>
        </p>

        {loading ? (
          <p style={{ color: "#94a3b8" }}>Loading…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {products.map((p) => {
              const soldOut = p.quantity <= 0;
              const qty = cart[p.id] || 0;
              return (
                <div
                  key={p.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "72px 1fr auto",
                    gap: 12,
                    alignItems: "center",
                    background: "#1e2937",
                    border: "1px solid #334155",
                    borderRadius: 12,
                    padding: 12,
                    opacity: soldOut ? 0.55 : 1,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    width={72}
                    height={96}
                    style={{
                      width: 72,
                      height: 96,
                      objectFit: "cover",
                      borderRadius: 8,
                      background: "#0f172a",
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      {p.name}
                    </div>
                    <div style={{ color: "#86efac", fontWeight: 600 }}>
                      {money(p.price)}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                      {soldOut ? "Sold out" : `${p.quantity} available`}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <label style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                      Qty
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={p.quantity}
                      disabled={soldOut || submitting}
                      value={qty}
                      onChange={(e) =>
                        setQty(p.id, Number(e.target.value), p.quantity)
                      }
                      style={{
                        width: 64,
                        padding: "8px 6px",
                        borderRadius: 8,
                        border: "1px solid #475569",
                        background: "#0f172a",
                        color: "white",
                        textAlign: "center",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 12,
            background: "#1e2937",
            border: "1px solid #334155",
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: "1.1rem" }}>Your reserve</h2>
          {lines.length === 0 ? (
            <p style={{ color: "#94a3b8", margin: "0 0 12px" }}>
              Choose quantities above.
            </p>
          ) : (
            <ul style={{ margin: "0 0 12px", paddingLeft: 18, color: "#e2e8f0" }}>
              {lines.map((l) => (
                <li key={l.product.id}>
                  {l.qty}× {l.product.name} — {money(l.qty * l.product.price)}
                </li>
              ))}
            </ul>
          )}
          <p style={{ margin: "0 0 12px", fontWeight: 700 }}>
            Total: {money(cartTotal)}
          </p>
          <input
            type="text"
            placeholder={unlockedName ? `Name (${unlockedName})` : "Your name"}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
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
          <input
            type="text"
            placeholder="Note for the pub (optional)"
            value={customerNote}
            onChange={(e) => setCustomerNote(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginBottom: 12,
              padding: 12,
              borderRadius: 8,
              border: "1px solid #475569",
              background: "#0f172a",
              color: "white",
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !lines.length}
            style={{
              width: "100%",
              padding: 14,
              borderRadius: 10,
              border: "none",
              background: submitting || !lines.length ? "#475569" : "#b45309",
              color: "white",
              fontWeight: 700,
              fontSize: "1.05rem",
              cursor: submitting || !lines.length ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Reserving…" : "Reserve bottles"}
          </button>
          {status ? (
            <p style={{ margin: "12px 0 0", color: "#93c5fd", lineHeight: 1.4 }}>
              {status}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
