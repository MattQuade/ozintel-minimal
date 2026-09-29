import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { registerAsset } from "@/lib/accounting/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json().catch(() => ({}));
      const id = String(body.id || "").trim();
      if (!id) {
        return NextResponse.json(
          { success: false, error: "id required" },
          { status: 400 }
        );
      }
      const asset = await registerAsset(id);
      return NextResponse.json({ success: true, asset });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Register failed",
        },
        { status: 400 }
      );
    }
  });
}
