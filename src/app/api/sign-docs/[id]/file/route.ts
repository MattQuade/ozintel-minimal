import { NextRequest, NextResponse } from "next/server";
import { readSignPdf } from "@/lib/signDocs";
import { sessionEmail } from "@/app/api/sign-docs/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const email = sessionEmail(req);
  if (!email) return new NextResponse("Restore your account first.", { status: 401 });
  const { id } = await context.params;
  const pdf = await readSignPdf(id, email);
  if (!pdf) return new NextResponse("Document not found", { status: 404 });
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
