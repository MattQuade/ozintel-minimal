import { NextRequest, NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  getCashbookSandboxCloseByEftposDate,
  listCashbookSandboxCloses,
  upsertCashbookSandboxClose,
} from "@/lib/cashbookSandbox/store";
import { sydneyTodayIso } from "@/lib/cashbookSandbox/sydneyDate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?date=YYYY-MM-DD — one night, or all recent sandbox closes. */
export async function GET(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    const date = req.nextUrl.searchParams.get("date")?.trim() || "";
    if (date) {
      const entry = await getCashbookSandboxCloseByEftposDate(date);
      return NextResponse.json({
        success: true,
        sandbox: true,
        today: sydneyTodayIso(),
        entry,
      });
    }
    const entries = await listCashbookSandboxCloses();
    return NextResponse.json({
      success: true,
      sandbox: true,
      today: sydneyTodayIso(),
      entries,
    });
  });
}

/** POST — save EFTPOS night + optional cash banked into sandbox only. */
export async function POST(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }
    const entry = await upsertCashbookSandboxClose({
      eftposDate: typeof body.eftposDate === "string" ? body.eftposDate : undefined,
      eftpos1: body.eftpos1,
      eftpos2: body.eftpos2,
      eftpos3: body.eftpos3,
      cashDepositDate: body.cashDepositDate,
      cashDeposit: body.cashDeposit,
    });
    return NextResponse.json({ success: true, sandbox: true, entry });
  });
}
