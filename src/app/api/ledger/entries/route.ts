import { NextResponse } from "next/server";
import { readLedger } from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const entries = await readLedger();
    return NextResponse.json(entries);
  } catch (err) {
    console.error("Entries API Error:", err);
    return NextResponse.json([]);
  }
}
