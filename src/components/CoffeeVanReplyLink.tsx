"use client";

import { useEffect, useState } from "react";
import { isCoffeeVanReplyAccount } from "@/lib/operations/pub/coffeeVan";

const USER_KEY = "ozintel_current_user";

/** Shown only on a phone already signed in as the coffee van. */
export default function CoffeeVanReplyLink() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return;
      const user = JSON.parse(raw) as { email?: string; phone?: string };
      setShow(isCoffeeVanReplyAccount(user));
    } catch {
      setShow(false);
    }
  }, []);

  if (!show) return null;

  return (
    <p style={{ margin: "0 0 16px" }}>
      <a
        href="/bottleshop/coffee/orders"
        style={{
          display: "inline-block",
          color: "#0f172a",
          background: "#86efac",
          textDecoration: "none",
          fontWeight: 700,
          padding: "8px 12px",
          borderRadius: 10,
        }}
      >
        Reply to coffee orders
      </a>
    </p>
  );
}
