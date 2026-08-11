import { NextResponse } from "next/server";
import { resetLedger } from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      await resetLedger();
      return NextResponse.json({ success: true, message: "Ledger cleared" });
    } catch (err) {
      console.error(err);
      return NextResponse.json({ error: "Failed to reset" }, { status: 500 });
    }
  });
}
