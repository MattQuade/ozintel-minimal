import { NextRequest, NextResponse } from "next/server";
import { getSignDoc, signDocWordHtml } from "@/lib/signDocs";
import { sessionEmail } from "@/app/api/sign-docs/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Word opens this HTML file. The signed copy is the PDF. */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const email = sessionEmail(req);
  if (!email) return new NextResponse("Restore your account first.", { status: 401 });
  const { id } = await context.params;
  const doc = await getSignDoc(id, email);
  if (!doc) return new NextResponse("Document not found", { status: 404 });
  if (doc.uploaded || !doc.body) {
    return new NextResponse("This one started as a PDF.", { status: 404 });
  }
  const filename = `${doc.title.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "document"}.doc`;
  return new NextResponse(signDocWordHtml(doc), {
    status: 200,
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
