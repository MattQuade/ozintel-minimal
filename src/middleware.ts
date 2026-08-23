import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * HTML documents were being served with Next's year-long static cache
 * (s-maxage=31536000). After a deploy, iPhones could keep an old shell whose
 * /_next/static chunk URLs 404 — buttons look fine but never hydrate, and
 * "Checking your access…" never finishes.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never interfere with hashed assets / data APIs
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, max-age=0, must-revalidate"
  );
  response.headers.set("CDN-Cache-Control", "no-store");
  return response;
}

export const config = {
  // Skip /api so large multipart uploads are not buffered/truncated by the
  // middleware proxy (that was causing "Failed to parse body as FormData").
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
