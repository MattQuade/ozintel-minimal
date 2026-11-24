import { NextRequest, NextResponse } from "next/server";
import { getSignDoc, readSignPdf } from "@/lib/signDocs";
import { sessionEmail } from "@/app/api/sign-docs/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pdfFileName(fileName: string | undefined, title: string): string {
  const raw = (fileName || title || "Document").replace(/[\r\n"]/g, "").trim();
  const name = /\.pdf$/i.test(raw) ? raw : `${raw}.pdf`;
  return name.slice(0, 180);
}

function attachmentHeader(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const email = sessionEmail(req);
  if (!email) return new NextResponse("Restore your account first.", { status: 401 });
  const { id } = await context.params;
  const doc = await getSignDoc(id, email);
  const pdf = doc ? await readSignPdf(id, email) : null;
  if (!doc || !pdf) return new NextResponse("Document not found", { status: 404 });
  const save = req.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": save ? attachmentHeader(pdfFileName(doc.fileName, doc.title)) : "inline",
      "Cache-Control": "no-store",
    },
  });
}
