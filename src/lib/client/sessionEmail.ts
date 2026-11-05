/** Client-side session helpers (mirrors server cookie name). */

export const SESSION_COOKIE_NAME = "ozintel_user_email";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Persist login cookie from the browser — more reliable than Set-Cookie alone on iOS PWAs. */
export function persistSessionEmailCookie(email: string) {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(String(email || "").trim().toLowerCase());
  if (!value) return;
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${SESSION_COOKIE_NAME}=${value}; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

export function clearSessionEmailCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}
