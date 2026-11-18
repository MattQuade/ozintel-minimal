/** John's mobile. Coffee order texts go here and nowhere else. */
export const COFFEE_VAN_PHONE_DIGITS = "61413693618";

/**
 * Extra logins that can reply on the coffee orders page.
 * They are not texted.
 */
export const COFFEE_VAN_REPLY_EMAILS = ["summer@ozintel.com.au"];

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

/** John, or a reply login such as Summer. Does not decide who is texted. */
export function isCoffeeVanReplyAccount(
  user: { email?: string; phone?: string } | null | undefined
): boolean {
  if (!user) return false;
  if (isCoffeeVanReplyEmail(user.email || "")) return true;
  return phoneDigits(user.phone || "") === COFFEE_VAN_PHONE_DIGITS;
}
