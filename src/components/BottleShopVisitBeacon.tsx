"use client";

import { useEffect } from "react";

/** Count one open of the public bottle shop hub. Does not block the page. */
export default function BottleShopVisitBeacon() {
  useEffect(() => {
    void fetch("/api/bottleshop/visits", {
      method: "POST",
      keepalive: true,
    }).catch(() => {});
  }, []);
  return null;
}
