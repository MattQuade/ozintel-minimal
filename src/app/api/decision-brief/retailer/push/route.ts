import { NextResponse } from "next/server";
import { pushRetailerBill } from "@/lib/decisionBrief/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retailer bill push.
 * Header: Authorization: Bearer <apiKey>
 * Body: { periodStart?, periodEnd?, amountAud?, kwh?, tariffNote?, apiKey? }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = req.headers.get("authorization") || "";
    const apiKey =
      auth.replace(/^Bearer\s+/i, "").trim() ||
      String(body.apiKey || "").trim();
    await pushRetailerBill({
      apiKey,
      periodStart: body.periodStart ? String(body.periodStart) : undefined,
      periodEnd: body.periodEnd ? String(body.periodEnd) : undefined,
      amountAud:
        body.amountAud != null ? Number(body.amountAud) : undefined,
      kwh: body.kwh != null ? Number(body.kwh) : undefined,
      tariffNote: body.tariffNote ? String(body.tariffNote) : undefined,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Push failed",
      },
      { status: 400 }
    );
  }
}
