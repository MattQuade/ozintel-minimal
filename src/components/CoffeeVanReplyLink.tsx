"use client";

import { useEffect, useState } from "react";

const USER_KEY = "ozintel_current_user";
const VAN_PHONE = "61413693618";

function isVanPhone(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return `61${digits.slice(1)}` === VAN_PHONE;
  }
  return digits === VAN_PHONE;
}

/** Shown only on the phone already signed in as the coffee van. */
export default function CoffeeVanReplyLink() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return;
      const user = JSON.parse(raw) as { phone?: string };
      setShow(isVanPhone(String(user?.phone || "")));
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
