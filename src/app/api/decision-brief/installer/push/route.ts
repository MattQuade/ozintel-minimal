import { NextResponse } from "next/server";
import { pushInstallerQuote } from "@/lib/decisionBrief/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Installer quote push.
 * Header: Authorization: Bearer <apiKey>
 * Body: { solarKw?, batteryKwh?, quoteAud?, paybackYears?, notes?, apiKey? }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = req.headers.get("authorization") || "";
    const apiKey =
      auth.replace(/^Bearer\s+/i, "").trim() ||
      String(body.apiKey || "").trim();
    await pushInstallerQuote({
      apiKey,
      solarKw: body.solarKw != null ? Number(body.solarKw) : undefined,
      batteryKwh:
        body.batteryKwh != null ? Number(body.batteryKwh) : undefined,
      quoteAud: body.quoteAud != null ? Number(body.quoteAud) : undefined,
      paybackYears:
        body.paybackYears != null ? Number(body.paybackYears) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
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
