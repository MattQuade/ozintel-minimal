import { NextRequest, NextResponse } from "next/server";
import { sendSignedDocEmail } from "@/lib/signDocsEmail";
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
    const sent = await sendSignedDocEmail({
      id,
      callerEmail: email,
      to: String(body.to || ""),
    });
    return NextResponse.json(
      { success: true, to: sent.to, fileName: sent.fileName },
      { headers: noStore }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send the email.";
    const status = message === "Document not found." ? 404 : 400;
    return NextResponse.json({ success: false, error: message }, { status, headers: noStore });
  }
}
