import { round2 } from "@/lib/accounting/invoiceMath";

/**
 * Business percentage for a personal/business split.
 * 1–99 splits the line. Empty, 0, and 100 mean the whole amount stays
 * on the business account.
 */
export function businessShare(
  grossAbs: number,
  percent: number | null | undefined
): { business: number; personal: number } | null {
  const pct = Number(percent);
  if (!Number.isFinite(pct) || pct < 1 || pct > 99) return null;
  const abs = round2(Math.abs(grossAbs));
  if (abs < 0.005) return null;
  const business = round2((abs * pct) / 100);
  const personal = round2(abs - business);
  if (business < 0.005 || personal < 0.005) return null;
  return { business, personal };
}

export function parseBusinessPercent(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const pct = Number(raw);
  if (!Number.isFinite(pct)) return null;
  const rounded = Math.round(pct);
  if (rounded < 1 || rounded > 99) return null;
  return rounded;
}
