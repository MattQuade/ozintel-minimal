import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { importXeroAssetsBuffer } from "@/lib/accounting/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") {
        return NextResponse.json(
          { success: false, error: "Upload a Xero Assets xlsx or csv" },
          { status: 400 }
        );
      }
      const replace = String(form.get("replace") || "") === "true";
      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = file.name || "assets.xlsx";
      const result = await importXeroAssetsBuffer(buffer, filename, {
        replace,
      });
      return NextResponse.json({
        success: true,
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
        total: result.total,
      });
    } catch (error) {
      console.error("Assets import error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Import failed",
        },
        { status: 400 }
      );
    }
  });
}
