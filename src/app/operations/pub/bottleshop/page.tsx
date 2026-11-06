"use client";

import { useCallback, useEffect, useState } from "react";
import OpsGate from "@/components/OpsGate";
import ReceiptCropEditor from "@/components/ReceiptCropEditor";
import {
  enableBottleShopPush,
  syncAppBadge,
} from "@/lib/client/bottleShopPush";
import {
  exportCroppedJpegFromSrc,
  FULL_CROP,
  type CropRectNorm,
} from "@/lib/client/cropImage";
import {
  BOTTLE_SHOP_CATEGORIES,
  type BottleCategory,
} from "@/lib/operations/pub/bottleShopCategories";

type Product = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  active: boolean;
  category: BottleCategory;
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

type ShopCustomer = {
  id: string;
  name: string;
  login?: string;
  phone: string;
  note: string;
  accessCode: string;
  active: boolean;
  createdAt: string;
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
  const [customers, setCustomers] = useState<ShopCustomer[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [reservedCount, setReservedCount] = useState(0);
  const [pushStatus, setPushStatus] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerLogin, setNewCustomerLogin] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerNote, setNewCustomerNote] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductQty, setNewProductQty] = useState("1");
  const [newProductCategory, setNewProductCategory] =
    useState<BottleCategory>("beer");
  const [drafts, setDrafts] = useState<
    Record<
      string,
      { price: string; quantity: string; name: string; category: BottleCategory }
    >
  >({});
  const [photoCrop, setPhotoCrop] = useState<{
    productId: string;
    productName: string;
    objectUrl: string;
    fileName: string;
  } | null>(null);
  const [crop, setCrop] = useState<CropRectNorm>(FULL_CROP);
  const [cropSaving, setCropSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (photoCrop?.objectUrl) URL.revokeObjectURL(photoCrop.objectUrl);
    };
  }, [photoCrop?.objectUrl]);

  const closePhotoCrop = () => {
    if (photoCrop?.objectUrl) URL.revokeObjectURL(photoCrop.objectUrl);
    setPhotoCrop(null);
    setCrop(FULL_CROP);
    setCropSaving(false);
  };

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
      setCustomers(data.customers || []);
      const reserved =
        typeof data.reservedCount === "number"
          ? data.reservedCount
          : (data.orders || []).filter(
              (o: Order) => o.status === "reserved"
            ).length;
      setReservedCount(reserved);
      void syncAppBadge(reserved);
      const nextDrafts: Record<
        string,
        {
          price: string;
          quantity: string;
          name: string;
          category: BottleCategory;
        }
      > = {};
      for (const p of nextProducts) {
        nextDrafts[p.id] = {
          name: p.name,
          price: String(p.price),
          quantity: String(p.quantity),
          category: p.category || "beer",
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
          category: draft.category,
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

  const beginPhotoCrop = (product: Product, file: File | null | undefined) => {
    if (!file) return;
    if (photoCrop?.objectUrl) URL.revokeObjectURL(photoCrop.objectUrl);
    setCrop(FULL_CROP);
    setPhotoCrop({
      productId: product.id,
      productName: product.name,
      objectUrl: URL.createObjectURL(file),
      fileName: file.name || `${product.id}.jpg`,
    });
  };

  const uploadPhoto = async (id: string, file: File) => {
    setStatus(`Uploading photo for ${id}…`);
    try {
      const draft = drafts[id];
      const form = new FormData();
      form.set("productId", id);
      form.set("file", file);
      if (draft?.name) form.set("name", draft.name);
      if (draft?.price) form.set("price", draft.price);
      if (draft?.quantity) form.set("quantity", draft.quantity);
      const res = await fetch("/api/operations/pub/bottleshop/photo", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!data.success) {
        setStatus(data.error || "Photo upload failed");
        return false;
      }
      setStatus("Photo + details saved — public bottle shop will show them.");
      await load();
      return true;
    } catch (error) {
      console.error(error);
      setStatus("Photo upload failed.");
      return false;
    }
  };

  const addProduct = async () => {
    if (!newProductName.trim()) {
      setStatus("Product name is required.");
      return;
    }
    setStatus("Adding product…");
    try {
      const res = await fetch("/api/operations/pub/bottleshop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProductName.trim(),
          price: Number(newProductPrice) || 0,
          quantity: Number(newProductQty) || 0,
          category: newProductCategory,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setStatus(data.error || "Could not add product");
        return;
      }
      setNewProductName("");
      setNewProductPrice("");
      setNewProductQty("1");
      setNewProductCategory("beer");
      setStatus(`Added ${data.product.name}. Upload a photo below.`);
      await load();
    } catch (error) {
      console.error(error);
      setStatus("Could not add product.");
    }
  };

  const confirmPhotoCrop = async () => {
    if (!photoCrop) return;
    setCropSaving(true);
    setStatus("Cropping photo…");
    try {
      const cropped = await exportCroppedJpegFromSrc({
        src: photoCrop.objectUrl,
        crop,
        fileName: photoCrop.fileName,
        maxEdge: 1600,
        quality: 0.88,
      });
      const ok = await uploadPhoto(photoCrop.productId, cropped);
      if (ok) closePhotoCrop();
    } catch (error) {
      console.error(error);
      setStatus(
        error instanceof Error ? error.message : "Could not crop photo."
      );
    } finally {
      setCropSaving(false);
    }
  };

  const addCustomer = async () => {
    if (!newCustomerName.trim()) {
      setStatus("Customer name is required.");
      return;
    }
    if (!newCustomerLogin.trim() && !newCustomerName.includes("@")) {
      setStatus("Username is required (e.g. jsmith@ozintel).");
      return;
    }
    setStatus("Adding customer…");
    try {
      const res = await fetch("/api/operations/pub/bottleshop/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCustomerName.trim(),
          login: newCustomerLogin.trim(),
          phone: newCustomerPhone.trim(),
          note: newCustomerNote.trim(),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setStatus(data.error || "Could not add customer");
        return;
      }
      setNewCustomerName("");
      setNewCustomerLogin("");
      setNewCustomerPhone("");
      setNewCustomerNote("");
      setStatus(
        `Added ${data.customer.name} — they restore with ${data.customer.login}`
      );
      await load();
    } catch (error) {
      console.error(error);
      setStatus("Could not add customer.");
    }
  };

  const toggleCustomer = async (id: string, active: boolean) => {
    try {
      const res = await fetch("/api/operations/pub/bottleshop/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active }),
      });
      const data = await res.json();
      if (!data.success) {
        setStatus(data.error || "Update failed");
        return;
      }
      await load();
    } catch (error) {
      console.error(error);
      setStatus("Customer update failed.");
    }
  };

  const deleteCustomer = async (id: string, label: string) => {
    if (
      !window.confirm(
        `Delete ${label} from the bottle shop? They will need to be added again to restore.`
      )
    ) {
      return;
    }
    setStatus(`Deleting ${label}…`);
    try {
      const res = await fetch("/api/operations/pub/bottleshop/customers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data.success) {
        setStatus(data.error || "Delete failed");
        return;
      }
      setStatus(`Deleted ${label}. You can add them again with a restore username.`);
      await load();
    } catch (error) {
      console.error(error);
      setStatus("Customer delete failed.");
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
        Update stock, prices, and photos. After you pick a photo you can crop
        away dead space before it saves. Photos are stored on the server
        (not in git) and show on the public bottle shop. Customer reserves
        write here and text you the bottles + quantities.
      </p>
      <div
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 12,
          background: "#1e2937",
          border: "1px solid #334155",
        }}
      >
        <p style={{ margin: "0 0 8px", color: "#e2e8f0" }}>
          Phone badge alerts · reserved now:{" "}
          <strong style={{ color: "#fbbf24" }}>{reservedCount}</strong>
        </p>
        <p style={{ margin: "0 0 10px", color: "#94a3b8", fontSize: "0.9rem" }}>
          Install OzIntel to your home screen, open this ledger, then enable
          alerts on that phone (iPhone needs iOS 16.4+ home-screen app).
        </p>
        <button
          type="button"
          onClick={async () => {
            setPushStatus("Enabling…");
            try {
              await enableBottleShopPush();
              await syncAppBadge(reservedCount);
              setPushStatus(
                "Enabled on this device. New orders will badge the OzIntel icon."
              );
            } catch (error) {
              setPushStatus(
                error instanceof Error ? error.message : "Could not enable push"
              );
            }
          }}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: "#7c3aed",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Enable phone badge alerts
        </button>
        {pushStatus ? (
          <p style={{ margin: "10px 0 0", color: "#c4b5fd" }}>{pushStatus}</p>
        ) : null}
      </div>
      {status ? (
        <p style={{ color: "#93c5fd" }}>{status}</p>
      ) : null}
      {loading ? (
        <p style={{ color: "#94a3b8" }}>Loading…</p>
      ) : (
        <>
          <h2 style={{ marginTop: 28 }}>Customers</h2>
          <p style={{ color: "#94a3b8", marginTop: 0 }}>
            Add people one by one with a restore username like{" "}
            <code>jsmith@ozintel</code>. They open /bottleshop and Restore My
            Account with that username — no invite codes.
          </p>
          <div
            style={{
              background: "#1e2937",
              border: "1px solid #334155",
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <input
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              placeholder="Customer name"
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginBottom: 8,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "white",
              }}
            />
            <input
              value={newCustomerLogin}
              onChange={(e) => setNewCustomerLogin(e.target.value)}
              placeholder="Username for restore (e.g. jsmith@ozintel)"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginBottom: 8,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "white",
              }}
            />
            <input
              value={newCustomerPhone}
              onChange={(e) => setNewCustomerPhone(e.target.value)}
              placeholder="Phone (optional)"
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginBottom: 8,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "white",
              }}
            />
            <input
              value={newCustomerNote}
              onChange={(e) => setNewCustomerNote(e.target.value)}
              placeholder="Note (optional)"
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginBottom: 8,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "white",
              }}
            />
            <button
              type="button"
              onClick={() => void addCustomer()}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "none",
                background: "#b45309",
                color: "white",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Add customer
            </button>
          </div>
          {customers.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>No customers yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {customers.map((c) => (
                <div
                  key={c.id}
                  style={{
                    background: "#1e2937",
                    border: "1px solid #334155",
                    borderRadius: 12,
                    padding: 12,
                    opacity: c.active ? 1 : 0.55,
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
                    <strong>{c.name}</strong>
                    <span style={{ color: c.active ? "#86efac" : "#fca5a5" }}>
                      {c.active ? "active" : "disabled"}
                    </span>
                  </div>
                  <p style={{ margin: "6px 0", color: "#fde68a" }}>
                    Restore as: {c.login || c.name}
                  </p>
                  {c.phone ? (
                    <p style={{ margin: "6px 0", color: "#94a3b8" }}>{c.phone}</p>
                  ) : null}
                  {c.note ? (
                    <p style={{ margin: "6px 0", color: "#94a3b8" }}>{c.note}</p>
                  ) : null}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => void toggleCustomer(c.id, !c.active)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: c.active ? "#7f1d1d" : "#15803d",
                        color: "white",
                        cursor: "pointer",
                      }}
                    >
                      {c.active ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void deleteCustomer(
                          c.id,
                          c.login || c.name || "customer"
                        )
                      }
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: "#991b1b",
                        color: "white",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ marginTop: 36 }}>Stock</h2>
          <div
            style={{
              background: "#1e2937",
              border: "1px solid #334155",
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <p style={{ margin: "0 0 8px", color: "#94a3b8" }}>
              Add a new item (e.g. 24pk cider), then upload its photo.
            </p>
            <input
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              placeholder="Product name"
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginBottom: 8,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "white",
              }}
            />
            <select
              value={newProductCategory}
              onChange={(e) =>
                setNewProductCategory(e.target.value as BottleCategory)
              }
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginBottom: 8,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "white",
              }}
            >
              {BOTTLE_SHOP_CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={newProductPrice}
                onChange={(e) => setNewProductPrice(e.target.value)}
                placeholder="Price"
                inputMode="decimal"
                style={{
                  flex: 1,
                  minWidth: 100,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #475569",
                  background: "#0f172a",
                  color: "white",
                }}
              />
              <input
                value={newProductQty}
                onChange={(e) => setNewProductQty(e.target.value)}
                placeholder="Qty"
                inputMode="numeric"
                style={{
                  flex: 1,
                  minWidth: 80,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #475569",
                  background: "#0f172a",
                  color: "white",
                }}
              />
              <button
                type="button"
                onClick={() => void addProduct()}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#b45309",
                  color: "white",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Add product
              </button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {products.map((p) => {
              const draft = drafts[p.id] || {
                name: p.name,
                price: String(p.price),
                quantity: String(p.quantity),
                category: p.category || "beer",
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
                      <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                        Shelf
                        <select
                          value={draft.category}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...draft,
                                category: e.target.value as BottleCategory,
                              },
                            }))
                          }
                          style={{
                            display: "block",
                            width: 120,
                            marginTop: 4,
                            padding: 8,
                            borderRadius: 8,
                            border: "1px solid #475569",
                            background: "#0f172a",
                            color: "white",
                          }}
                        >
                          {BOTTLE_SHOP_CATEGORIES.map((c) => (
                            <option key={c.slug} value={c.slug}>
                              {c.label}
                            </option>
                          ))}
                        </select>
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
                            beginPhotoCrop(p, file);
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

      {photoCrop ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(2, 6, 23, 0.82)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Crop bottle photo"
        >
          <div
            style={{
              width: "100%",
              maxWidth: 720,
              maxHeight: "92vh",
              overflow: "auto",
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 14,
              padding: 16,
              color: "white",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "flex-start",
                marginBottom: 10,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Crop bottle photo</h2>
                <p style={{ margin: "6px 0 0", color: "#94a3b8", fontSize: 14 }}>
                  Drag the border to cut away dead space around{" "}
                  {photoCrop.productName}.
                </p>
              </div>
              <button
                type="button"
                disabled={cropSaving}
                onClick={closePhotoCrop}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  cursor: cropSaving ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                Close
              </button>
            </div>
            <ReceiptCropEditor
              key={photoCrop.objectUrl}
              src={photoCrop.objectUrl}
              initialCrop={FULL_CROP}
              theme="dark"
              style={{ minHeight: 360 }}
              onCropChange={setCrop}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 14,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                disabled={cropSaving}
                onClick={closePhotoCrop}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #475569",
                  background: "transparent",
                  color: "white",
                  fontWeight: 600,
                  cursor: cropSaving ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={cropSaving}
                onClick={() => void confirmPhotoCrop()}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#b45309",
                  color: "white",
                  fontWeight: 600,
                  cursor: cropSaving ? "not-allowed" : "pointer",
                }}
              >
                {cropSaving ? "Uploading…" : "Crop & upload"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
