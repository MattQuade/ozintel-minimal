/** Summer Gill's mobile. Coffee order texts go here. */
export const COFFEE_VAN_PHONE_DIGITS = "61488753461";

/**
 * Logins that can reply on the coffee orders page.
 * John's mobile stays here so he can still reply. He is not texted.
 */
export const COFFEE_VAN_REPLY_EMAILS = ["summer@ozintel.com.au"];
export const COFFEE_VAN_REPLY_PHONE_DIGITS = ["61413693618"];

export function isCoffeeVanReplyEmail(email: string): boolean {
  const value = String(email || "").trim().toLowerCase();
  return COFFEE_VAN_REPLY_EMAILS.includes(value);
}

function phoneDigits(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return `61${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("4")) return `61${digits}`;
  return digits;
}

/** Summer, or John's phone. Does not decide who is texted. */
export function isCoffeeVanReplyAccount(
  user: { email?: string; phone?: string } | null | undefined
): boolean {
  if (!user) return false;
  if (isCoffeeVanReplyEmail(user.email || "")) return true;
  const digits = phoneDigits(user.phone || "");
  if (!digits) return false;
  if (digits === COFFEE_VAN_PHONE_DIGITS) return true;
  return COFFEE_VAN_REPLY_PHONE_DIGITS.includes(digits);
}
