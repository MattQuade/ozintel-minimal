import BottleShopHubPromos from "@/components/BottleShopHubPromos";
import BottleShopInstallButton from "@/components/BottleShopInstallButton";
import BottleShopReplies from "@/components/BottleShopReplies";
import BottleShopVisitBeacon from "@/components/BottleShopVisitBeacon";
import { BOTTLE_SHOP_CATEGORIES } from "@/lib/operations/pub/bottleShopCategories";
import { shopCanvas, shopMuted } from "@/components/bottleShopLook";

/** Category hub — server-rendered so phones see shelves even if JS is delayed. */
export default function BottleShopHubPage() {
  return (
    <main
      style={{
        fontFamily: "system-ui",
        background: shopCanvas,
        color: "#0c2f6b",
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
      <BottleShopVisitBeacon />
      <h1 style={{ color: "#f97316", marginBottom: 8 }}>Bottle Shop</h1>
      <p style={{ color: shopMuted, margin: "0 0 24px" }}>
        Pick a shelf. No account needed.
      </p>
      <BottleShopInstallButton />
      <BottleShopReplies />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "center",
        }}
      >
        {BOTTLE_SHOP_CATEGORIES.map((cat) => (
          <a
            key={cat.slug}
            href={`/bottleshop/${cat.slug}`}
            style={{
              display: "block",
              width: "90%",
              maxWidth: 400,
              padding: 16,
              borderRadius: 12,
              background: "#9a3412",
              color: "white",
              textDecoration: "none",
              fontWeight: "bold",
              lineHeight: 1.3,
            }}
          >
            {cat.slug === "coffee" ? "Thu & Fri Morning Coffee 5.30 - 12" : cat.label}
          </a>
        ))}
        <BottleShopHubPromos />
      </div>
    </main>
  );
}
