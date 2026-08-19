import type { NextRequest } from "next/server";

/**
 * Public site origin for redirects behind Render/Cloudflare.
 * Never use req.url — on Render that is often https://localhost:10000
 * and Safari then shows "cannot open the page / could not connect".
 */
export function publicSiteOrigin(req: NextRequest): string {
  const fromEnv =
    process.env.OZINTEL_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "";
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* ignore bad env */
    }
  }

  const forwardedHost = req.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const hostHeader = req.headers.get("host")?.split(",")[0]?.trim();
  const host = forwardedHost || hostHeader || "";
  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

  if (host && !isInternalHost(host)) {
    return `${proto}://${host}`;
  }

  return "https://ozintel.com.au";
}

function isInternalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h.endsWith(".internal") ||
    h.endsWith(".local") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(h)
  );
}

export function publicHomeUrl(
  req: NextRequest,
  params: Record<string, string> = {}
): string {
  const url = new URL("/", publicSiteOrigin(req));
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, v);
  }
  return url.toString();
}
