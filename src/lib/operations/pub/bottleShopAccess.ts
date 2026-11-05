import { findBottleCustomerByCode } from "@/lib/operations/pub/bottleshop";

export function readBottleShopCodeFromRequest(req: Request): string {
  const header = req.headers.get("x-bottleshop-code") || "";
  if (header.trim()) return header.trim();
  try {
    const url = new URL(req.url);
    return (url.searchParams.get("code") || "").trim();
  } catch {
    return "";
  }
}

export async function requireBottleShopCustomer(accessCode: string) {
  const customer = await findBottleCustomerByCode(accessCode);
  if (!customer) {
    return {
      ok: false as const,
      error: "Enter a valid invite code from the pub to use the bottle shop.",
    };
  }
  return { ok: true as const, customer };
}
