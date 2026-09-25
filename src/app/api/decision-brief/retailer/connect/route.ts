import { NextResponse } from "next/server";
import { acceptRetailerConnect } from "@/lib/decisionBrief/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public retailer connect — no OzIntel login.
 * Body: { connectCode, retailerName, contactEmail }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const connectCode = String(body.connectCode || "").trim();
    const retailerName = String(body.retailerName || "").trim();
    const contactEmail = String(body.contactEmail || "").trim().toLowerCase();
    if (!connectCode || !retailerName || !contactEmail) {
      return NextResponse.json(
        {
          success: false,
          error: "connectCode, retailerName, and contactEmail are required",
        },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return NextResponse.json(
        { success: false, error: "Invalid contact email" },
        { status: 400 }
      );
    }

    const { ownerEmail, connection } = await acceptRetailerConnect({
      connectCode,
      retailerName,
      contactEmail,
    });

    return NextResponse.json({
      success: true,
      ownerEmail,
      retailerName: connection.retailerName,
      apiKey: connection.apiKey,
      pushUrl: "/api/decision-brief/retailer/push",
      label:
        "Connected. Save your API key — use it to push bill totals into this business Decision Brief.",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error ? err.message : "Could not complete connect",
      },
      { status: 400 }
    );
  }
}
