"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import BottleShopInstallButton from "@/components/BottleShopInstallButton";
import BottleShopReplies from "@/components/BottleShopReplies";
import {
  clearSessionEmailCookie,
  persistSessionEmailCookie,
} from "@/lib/client/sessionEmail";
import {
  bottleCategoryLabel,
  COFFEE_MILKS,
  COFFEE_MILK_ROWS,
  coffeeLineKey,
  coffeeMilkExtra,
  coffeeMilkLabel,
  coffeeShelfGroups,
  coffeeUnitPrice,
  isBottleCategory,
  type BottleCategory,
  type CoffeeMilk,
  type CoffeeSize,
} from "@/lib/operations/pub/bottleShopCategories";

type Product = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  active: boolean;
  category?: BottleCategory;
  size?: CoffeeSize;
  coffeeType?: string;
};

type Cart = Record<string, number>;

type ReserveLine = {
  key: string;
  product: Product;
  qty: number;
  milk?: CoffeeMilk;
};

function choiceStyle(selected: boolean): CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 999,
    border: selected ? "2px solid #fbbf24" : "1px solid #475569",
    background: selected ? "#78350f" : "#0f172a",
    color: "white",
    fontWeight: 700,
    fontSize: "0.95rem",
    lineHeight: 1.2,
    cursor: "pointer",
    minHeight: 40,
    whiteSpace: "nowrap",
  };
}

/** One drink: pick a size, pick a milk, type the quantity for that pair. */
function CoffeeDrink({
  title,
  photo,
  sizes,
  cart,
  qtyText,
  submitting,
  onQty,
}: {
  title: string;
  photo: string;
  sizes: Array<{ id: string; label: string; price: number }>;
  cart: Cart;
  qtyText: Record<string, string>;
  submitting: boolean;
  onQty: (key: string, raw: string) => void;
}) {
  const [sizeId, setSizeId] = useState(sizes[0]?.id || "");
  const [milk, setMilk] = useState<CoffeeMilk>("full-cream");
  const size = sizes.find((item) => item.id === sizeId) || sizes[0];
  const key = size ? coffeeLineKey(size.id, milk) : "";
  const unit = size ? coffeeUnitPrice(size.price, milk) : 0;
  const surchargeOn = coffeeMilkExtra(milk) > 0;
  const reserved = sizes.some((item) =>
    COFFEE_MILKS.some((option) => (cart[coffeeLineKey(item.id, option.slug)] || 0) > 0)
  );
  return (
    <div
      style={{
        marginTop: 8,
        padding: 12,
        borderRadius: 12,
        background: "#1e2937",
        border: reserved ? "2px solid #fbbf24" : "1px solid #334155",
        minWidth: 0,
      }}
    >
      {title ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt=""
              width={48}
              height={48}
              style={{
                width: 48,
                height: 48,
                objectFit: "cover",
                borderRadius: 8,
                background: "#0f172a",
                flexShrink: 0,
              }}
            />
          ) : null}
          <div style={{ fontWeight: 700 }}>{title}</div>
        </div>
      ) : null}
      {sizes.some((item) => item.label) ? (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {sizes.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === size?.id}
              onClick={() => setSizeId(item.id)}
              style={{
                ...choiceStyle(item.id === size?.id),
                flex: "1 1 0",
                padding: "10px 6px",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {COFFEE_MILK_ROWS.map((row) => (
          <div key={row.join("-")} style={{ display: "flex", gap: 6 }}>
            {row.map((slug) => {
              const option = COFFEE_MILKS.find((item) => item.slug === slug);
              if (!option) return null;
              return (
                <button
                  key={option.slug}
                  type="button"
                  aria-pressed={option.slug === milk}
                  onClick={() => setMilk(option.slug)}
                  style={{
                    ...choiceStyle(option.slug === milk),
                    flex: "1 1 0",
                    padding: "10px 4px",
                  }}
                >
                  {option.button}
                </button>
              );
            })}
            {row.includes("almond") ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label="Almond, oat and soy add 50 cents"
                style={{
                  ...choiceStyle(surchargeOn),
                  flex: "1 1 0",
                  padding: "10px 4px",
                  color: "#86efac",
                  cursor: "default",
                }}
              >
                +50c
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginTop: 10,
        }}
      >
        <div style={{ color: "#86efac", fontWeight: 600, minWidth: 0 }}>
          {unit > 0 ? money(unit) : ""}
        </div>
        <label style={{ fontSize: "0.75rem", color: "#94a3b8", flexShrink: 0 }}>
          Qty
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            disabled={submitting || !size}
            value={key ? qtyText[key] ?? "" : ""}
            onChange={(e) => key && onQty(key, e.target.value)}
            style={{
              display: "block",
              width: 64,
              marginTop: 4,
              padding: "8px 6px",
              borderRadius: 8,
              border: "1px solid #475569",
              background: "#0f172a",
              color: "white",
              textAlign: "center",
            }}
          />
        </label>
      </div>
    </div>
  );
}

const LOGIN_KEY = "ozintel_bottleshop_login";
const USER_KEY = "ozintel_current_user";
const LEGACY_CODE_KEY = "ozintel_bottleshop_code";

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

/** Uploaded bottle-shop photos. Placeholder wine art is not a coffee photo. */
function uploadedPhoto(url?: string) {
  const value = String(url || "");
  return value.startsWith("/api/bottleshop/photos/") ? value : "";
}

function readStoredLogin() {
  try {
    return (localStorage.getItem(LOGIN_KEY) || "").trim();
  } catch {
    return "";
  }
}

function writeStoredLogin(login: string) {
  try {
    const trimmed = String(login || "").trim();
    if (trimmed) localStorage.setItem(LOGIN_KEY, trimmed);
    else localStorage.removeItem(LOGIN_KEY);
  } catch {
    // ignore
  }
}

function readStoredUserEmail() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { email?: string };
    return String(parsed?.email || "").trim();
  } catch {
    return "";
  }
}

function clearLegacyInviteCode() {
  try {
    localStorage.removeItem(LEGACY_CODE_KEY);
  } catch {
    // ignore
  }
}

export default function BottleShopCategoryPage() {
  const params = useParams();
  const router = useRouter();
  const categorySlug = String(params?.category || "")
    .trim()
    .toLowerCase();
  const category: BottleCategory | null = isBottleCategory(categorySlug)
    ? categorySlug
    : null;
  const categoryLabel = category ? bottleCategoryLabel(category) : "";

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [qtyText, setQtyText] = useState<Record<string, string>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [restoreInput, setRestoreInput] = useState("");
  const [unlockedName, setUnlockedName] = useState("");
  const [shelfOpen, setShelfOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!category) router.replace("/bottleshop");
  }, [category, router]);

  const shelfShown = useRef(false);

  const loadCatalogue = useCallback(async () => {
    if (!category) return false;
    if (!shelfShown.current) setLoading(true);
    try {
      const res = await fetch(
        `/api/bottleshop/products?category=${encodeURIComponent(category)}`,
        {
          credentials: "include",
          cache: "no-store",
        }
      );
      const data = await res.json();
      if (data.success) {
        shelfShown.current = true;
        setProducts(data.products || []);
        setShelfOpen(true);
        setStatus("");
        return true;
      }
      setProducts([]);
      setShelfOpen(false);
      setStatus(data.error || "Could not load the bottle shop.");
      return false;
    } catch (error) {
      console.error(error);
      setStatus("Failed to load bottle shop.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [category]);

  const normalizeRestoreQuery = (raw: string) => {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) return "";
    // Some phones turn @ into 2 (tbong2ozintel → tbong@ozintel).
    if (!trimmed.includes("@") && /^[a-z0-9._+-]+2[a-z0-9.-]+$/i.test(trimmed)) {
      return trimmed.replace(/2/, "@");
    }
    return trimmed;
  };

  const silentRestore = useCallback(async (query: string, quiet = false) => {
    const trimmed = normalizeRestoreQuery(query);
    if (!trimmed) return false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("/api/bottleshop/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: trimmed, category }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success || !data.user?.email) {
        if (!quiet) {
          setStatus(
            data.error ||
              "No bottle shop account found. Ask the pub to add this username in the Bottle Shop ledger."
          );
        }
        return false;
      }
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      } catch {
        // ignore
      }
      writeStoredLogin(data.user.email);
      persistSessionEmailCookie(data.user.email);
      setRestoreInput(data.user.email);
      // Unlock from restore payload — do not depend on a second cookie round-trip.
      if (Array.isArray(data.products)) {
        setProducts(data.products);
        setUnlockedName(data.user.name || data.user.email);
        setStatus("");
        return true;
      }
      return loadCatalogue();
    } catch (error) {
      console.error(error);
      const aborted =
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError");
      if (!quiet) {
        setStatus(
          aborted
            ? "Restore timed out. Try again on wifi."
            : "Restore failed. Please try again."
        );
      }
      return false;
    } finally {
      window.clearTimeout(timer);
    }
  }, [category, loadCatalogue]);

  useEffect(() => {
    if (!category) return;
    shelfShown.current = false;
    clearLegacyInviteCode();
    const storedLogin = normalizeRestoreQuery(
      readStoredLogin() || readStoredUserEmail()
    );
    if (storedLogin) setRestoreInput(storedLogin);
    void (async () => {
      const ok = await loadCatalogue();
      if (storedLogin) await silentRestore(storedLogin, ok);
      if (!ok && !storedLogin) {
        setStatus("Could not load the bottle shop. Try again.");
      }
    })();
    // Boot once per category shelf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  useEffect(() => {
    const refresh = () => {
      if (restoring) return;
      if (document.visibilityState === "visible") {
        void loadCatalogue();
      }
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [loadCatalogue, restoring]);

  const unlocked = shelfOpen || products.length > 0 || Boolean(unlockedName);

  const lines = useMemo((): ReserveLine[] => {
    if (category !== "coffee") {
      return products
        .map((product) => ({
          key: product.id,
          product,
          qty: cart[product.id] || 0,
        }))
        .filter((line) => line.qty > 0);
    }
    const reserved: ReserveLine[] = [];
    for (const product of products) {
      for (const option of COFFEE_MILKS) {
        const key = coffeeLineKey(product.id, option.slug);
        const qty = cart[key] || 0;
        if (qty > 0) reserved.push({ key, product, qty, milk: option.slug });
      }
    }
    return reserved;
  }, [products, cart, category]);

  const cartTotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + l.qty * coffeeUnitPrice(l.product.price, l.milk),
        0
      ),
    [lines]
  );

  const coffeeGroups = useMemo(() => coffeeShelfGroups(products), [products]);
  const coffeeRowIds = useMemo(
    () => new Set(coffeeGroups.flatMap((group) => group.rows.map((row) => row.id))),
    [coffeeGroups]
  );

  const setQty = (id: string, raw: string) => {
    const digits = String(raw || "").replace(/\D/g, "").slice(0, 2);
    setQtyText((prev) => ({ ...prev, [id]: digits }));
    const qty = digits ? Number(digits) : 0;
    setCart((prev) => {
      const copy = { ...prev };
      if (qty <= 0) delete copy[id];
      else copy[id] = qty;
      return copy;
    });
  };

  const removeReserved = (id: string) => {
    setQtyText((prev) => ({ ...prev, [id]: "" }));
    setCart((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const restoreAccount = async () => {
    const query = normalizeRestoreQuery(restoreInput);
    if (!query) {
      setStatus("Enter your username (e.g. jsmith@ozintel).");
      return;
    }
    setRestoring(true);
    setStatus("Restoring…");
    try {
      writeStoredLogin(query);
      setRestoreInput(query);
      const ok = await silentRestore(query);
      if (ok) {
        setStatus("Welcome — you will stay signed in on this phone.");
      }
    } finally {
      setRestoring(false);
    }
  };

  const signOut = () => {
    writeStoredLogin("");
    clearLegacyInviteCode();
    clearSessionEmailCookie();
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      // ignore
    }
    setUnlockedName("");
    setCustomerName("");
    setCart({});
    setQtyText({});
    setStatus("");
    void loadCatalogue();
  };

  const submit = async () => {
    if (!unlocked) {
      setStatus("The shelf is still loading.");
      return;
    }
    if (!customerName.trim() && !unlockedName) {
      setStatus("Enter your name.");
      return;
    }
    if (!lines.length) {
      setStatus("Select at least one bottle.");
      return;
    }
    if (category !== "coffee") {
      const over = lines.find((l) => l.qty > l.product.quantity);
      if (over) {
        setStatus(
          `${over.product.name} only has ${over.product.quantity} available.`
        );
        return;
      }
    }
    setSubmitting(true);
    setStatus("Reserving…");
    try {
      const res = await fetch("/api/bottleshop/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customerName: customerName.trim() || unlockedName || undefined,
          customerNote: customerNote.trim() || undefined,
          items: lines.map((l) => ({
            productId: l.product.id,
            quantity: l.qty,
            ...(l.milk ? { milk: l.milk } : {}),
          })),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setStatus(data.error || "Could not reserve.");
        await loadCatalogue();
        return;
      }
      const nextProducts = Array.isArray(data.products) ? data.products : [];
      setProducts(
        category
          ? nextProducts.filter(
              (p: Product) => !p.category || p.category === category
            )
          : nextProducts
      );
      setCart({});
      setQtyText({});
      setStatus("Reserved. Pay & collect at the pub.");
    } catch (error) {
      console.error(error);
      setStatus("Reserve failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!category) {
    return (
      <main
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#0f172a",
          color: "white",
          minHeight: "100vh",
          padding: 24,
        }}
      >
        <p style={{ color: "#94a3b8" }}>Opening bottle shop…</p>
      </main>
    );
  }

  if (!unlocked) {
    return (
      <main
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#0f172a",
          color: "white",
          minHeight: "100vh",
          padding:
            "calc(20px + env(safe-area-inset-top, 0px)) 16px 48px",
        }}
      >
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <p style={{ margin: "0 0 8px", color: "#94a3b8", fontSize: "0.9rem" }}>
            OzIntel · Pub Bottle Shop
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: "1.75rem", color: "#f8fafc" }}>
            {categoryLabel}
          </h1>
          <p style={{ margin: "0 0 12px" }}>
            <a
              href="/bottleshop"
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
              ← Bottle Shop
            </a>
          </p>
          <p style={{ margin: "0 0 16px", color: "#94a3b8", lineHeight: 1.45 }}>
            The {categoryLabel} shelf did not load. Try again, or restore a username if you have one.
          </p>

          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: "#1e2937",
              border: "1px solid #334155",
              marginBottom: 16,
            }}
          >
            <h2 style={{ margin: "0 0 10px", fontSize: "1.1rem" }}>
              Restore My Account
            </h2>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="e.g. jsmith@ozintel"
              value={restoreInput}
              onChange={(e) => setRestoreInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void restoreAccount();
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginBottom: 10,
                padding: 12,
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "white",
              }}
            />
            <button
              type="button"
              disabled={restoring}
              onClick={() => void restoreAccount()}
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 10,
                border: "none",
                background: "#0ea5e9",
                color: "white",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {restoring ? "Restoring…" : "Restore Account"}
            </button>
          </div>

          {status ? (
            <p style={{ margin: "0", color: "#fca5a5" }}>{status}</p>
          ) : null}
          {loading ? (
            <p style={{ marginTop: 16, color: "#94a3b8" }}>Checking access…</p>
          ) : null}
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
        padding:
          "calc(20px + env(safe-area-inset-top, 0px)) 16px 48px",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <p style={{ margin: "0 0 8px", color: "#94a3b8", fontSize: "0.9rem" }}>
          OzIntel · Pub Bottle Shop
          {unlockedName ? ` · ${unlockedName}` : ""}
        </p>
        <h1 style={{ margin: "0 0 12px", fontSize: "1.75rem", color: "#f8fafc" }}>
          {categoryLabel}
        </h1>
        <p style={{ margin: "0 0 12px" }}>
          <a
            href="/bottleshop"
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
            ← Bottle Shop
          </a>
        </p>
        <p style={{ margin: "0 0 16px", color: "#94a3b8", lineHeight: 1.45 }}>
          {category === "coffee"
            ? "Choose the size and the milk, then the quantity. Switch milk to add another. Pay and collect at the van."
            : `Reserve ${categoryLabel} here — pay and collect at the pub.`}
        </p>

        <BottleShopInstallButton />

        {unlockedName ? (
          <p style={{ margin: "0 0 16px" }}>
            <button
              type="button"
              onClick={signOut}
              style={{
                background: "transparent",
                border: "none",
                color: "#38bdf8",
                padding: 0,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Sign out of bottle shop
            </button>
          </p>
        ) : null}

        {loading ? (
          <p style={{ color: "#94a3b8" }}>Loading…</p>
        ) : category === "coffee" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {coffeeGroups.map((group) => {
              const typeItems = group.rows.map((row) => ({
                id: row.id,
                size: row.sizeLabel,
              }));
              const typePhoto =
                typeItems
                  .map((item) =>
                    uploadedPhoto(
                      products.find((product) => product.id === item.id)?.imageUrl
                    )
                  )
                  .find(Boolean) || "";
              return (
              <div key={group.type}>
                <div
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "#9a3412",
                    color: "white",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {typePhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={typePhoto}
                      alt=""
                      width={56}
                      height={56}
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: "cover",
                        borderRadius: 8,
                        background: "#7c2d12",
                        flexShrink: 0,
                      }}
                    />
                  ) : null}
                  <span>{group.type}</span>
                </div>
                <CoffeeDrink
                  title=""
                  photo=""
                  sizes={typeItems.map((item) => {
                    const product = products.find((row) => row.id === item.id);
                    return {
                      id: item.id,
                      label: item.size,
                      price: product?.price || 0,
                    };
                  })}
                  cart={cart}
                  qtyText={qtyText}
                  submitting={submitting}
                  onQty={setQty}
                />
              </div>
              );
            })}
            {products
              .filter((p) => !coffeeRowIds.has(p.id))
              .map((p) => (
                <CoffeeDrink
                  key={p.id}
                  title={p.name}
                  photo={uploadedPhoto(p.imageUrl)}
                  sizes={[{ id: p.id, label: "", price: p.price }]}
                  cart={cart}
                  qtyText={qtyText}
                  submitting={submitting}
                  onQty={setQty}
                />
              ))}
          </div>
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
                    <div style={{ color: "#ef4444", fontSize: "1.071rem" }}>
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
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={soldOut || submitting}
                      value={qtyText[p.id] ?? ""}
                      onChange={(e) => setQty(p.id, e.target.value)}
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

        <BottleShopReplies />
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
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 12,
              }}
            >
              {lines.map((l) => (
                <div
                  key={l.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    color: "#e2e8f0",
                  }}
                >
                  <span style={{ minWidth: 0, lineHeight: 1.35 }}>
                    {l.qty}× {l.product.name}
                    {l.milk ? `, ${coffeeMilkLabel(l.milk)}` : ""} —{" "}
                    {money(l.qty * coffeeUnitPrice(l.product.price, l.milk))}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeReserved(l.key)}
                    style={{
                      flexShrink: 0,
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: "#991b1b",
                      color: "white",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
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
            placeholder={
              category === "coffee"
                ? "Note for the coffee van (optional)"
                : "Note for the pub (optional)"
            }
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
            onClick={() => void submit()}
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
            {submitting
              ? "Reserving…"
              : category === "coffee"
                ? "Reserve"
                : "Reserve bottles"}
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
