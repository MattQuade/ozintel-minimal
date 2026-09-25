import { NextResponse } from "next/server";
import { acceptInstallerConnect } from "@/lib/decisionBrief/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public solar/battery installer connect — no OzIntel login.
 * Body: { connectCode, installerName, contactEmail }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const connectCode = String(body.connectCode || "").trim();
    const installerName = String(
      body.installerName || body.companyName || ""
    ).trim();
    const contactEmail = String(body.contactEmail || "").trim().toLowerCase();
    if (!connectCode || !installerName || !contactEmail) {
      return NextResponse.json(
        {
          success: false,
          error: "connectCode, installerName, and contactEmail are required",
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

    const { ownerEmail, connection } = await acceptInstallerConnect({
      connectCode,
      installerName,
      contactEmail,
    });

    return NextResponse.json({
      success: true,
      ownerEmail,
      installerName: connection.installerName,
      apiKey: connection.apiKey,
      pushUrl: "/api/decision-brief/installer/push",
      label:
        "Connected. Save your API key — use it to push solar/battery quotes into this business Decision Brief.",
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
