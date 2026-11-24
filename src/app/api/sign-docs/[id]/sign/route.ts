import { NextRequest, NextResponse } from "next/server";
import { signSignDoc } from "@/lib/signDocs";
import { sessionEmail } from "@/app/api/sign-docs/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const email = sessionEmail(req);
  if (!email) {
    return NextResponse.json(
      { success: false, error: "Restore your account on the OzIntel home page first." },
      { status: 401, headers: noStore }
    );
  }
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const dataUrl = String(body.png || "");
    const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      return NextResponse.json(
        { success: false, error: "Draw your signature first." },
        { status: 400, headers: noStore }
      );
    }
    const png = Buffer.from(match[1], "base64");
    const document = await signSignDoc({ id, email, png });
    return NextResponse.json({ success: true, document }, { headers: noStore });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not save the signature." },
      { status: 400, headers: noStore }
    );
  }
}
