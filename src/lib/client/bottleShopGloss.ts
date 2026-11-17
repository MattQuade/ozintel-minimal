import type { CSSProperties } from "react";

/** Light green gloss for Bottle Shop buttons. Dark text stays readable. */
export const bottleShopGloss: CSSProperties = {
  background:
    "linear-gradient(180deg, #f7fee7 0%, #d9f99d 30%, #86efac 58%, #4ade80 100%)",
  color: "#14532d",
  border: "1px solid #d9f99d",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -12px 16px rgba(22,101,52,0.2), 0 1px 2px rgba(0,0,0,0.28)",
};
