import { NextRequest } from "next/server";
import {
  decodeSessionEmailCookie,
  SESSION_COOKIE_NAME,
} from "@/lib/sessionCookie";

export function sessionEmail(req: NextRequest): string {
  const raw = req.cookies.get(SESSION_COOKIE_NAME)?.value || "";
  return decodeSessionEmailCookie(raw).trim().toLowerCase();
}
