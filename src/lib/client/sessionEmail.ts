/** Client-side session helpers (mirrors server cookie name). */

export const SESSION_COOKIE_NAME = "ozintel_user_email";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function cookieAttrs(): string {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  return `; Path=/; SameSite=Lax${secure}`;
}

/** Persist login cookie from the browser — more reliable than Set-Cookie alone on iOS PWAs. */
export function persistSessionEmailCookie(email: string) {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(String(email || "").trim().toLowerCase());
  if (!value) return;
  const expires = new Date(Date.now() + SESSION_COOKIE_MAX_AGE * 1000).toUTCString();
  document.cookie = `${SESSION_COOKIE_NAME}=${value}; Max-Age=${SESSION_COOKIE_MAX_AGE}; Expires=${expires}${cookieAttrs()}`;
}

export function clearSessionEmailCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE_NAME}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${cookieAttrs()}`;
}
