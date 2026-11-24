import { NextRequest, NextResponse } from "next/server";
import { deleteSignDoc } from "@/lib/signDocs";
import { sessionEmail } from "@/app/api/sign-docs/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function DELETE(
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
    await deleteSignDoc(id, email);
    return NextResponse.json({ success: true }, { headers: noStore });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not delete the document." },
      { status: 400, headers: noStore }
    );
  }
}
