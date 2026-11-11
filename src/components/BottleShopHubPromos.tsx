"use client";

import { useEffect, useState, type CSSProperties } from "react";

type HubButton = { id: string; label: string };

const FALLBACK: HubButton[] = [
  { id: "tue-draw", label: "Tue Nite Draw $2,500" },
  { id: "fri-raffles", label: "Fri Nite Meat Raffles" },
];

const buttonStyle: CSSProperties = {
  display: "block",
  width: "90%",
  maxWidth: 400,
  padding: 16,
  borderRadius: 12,
  background: "#9a3412",
  color: "white",
  textDecoration: "none",
  fontWeight: "bold",
  border: "none",
  cursor: "default",
  fontFamily: "inherit",
  fontSize: "inherit",
  textAlign: "center",
};

/** Extra brown hub buttons under Cruisers — labels come from the ledger. */
export default function BottleShopHubPromos() {
  const [buttons, setButtons] = useState<HubButton[]>(FALLBACK);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const res = await fetch("/api/bottleshop/hub", { cache: "no-store" });
        const data = await res.json();
        if (cancel || !data.success || !Array.isArray(data.buttons)) return;
        if (data.buttons.length) setButtons(data.buttons);
      } catch {
        // keep fallback labels
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <>
      {buttons.map((btn) => (
        <button key={btn.id} type="button" style={buttonStyle}>
          {btn.label}
        </button>
      ))}
    </>
  );
}
