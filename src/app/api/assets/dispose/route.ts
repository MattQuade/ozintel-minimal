import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { disposeAsset } from "@/lib/accounting/assets";

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
      const asset = await disposeAsset({
        id,
        disposalDate: String(body.disposalDate || ""),
        proceeds: Number(body.proceeds) || 0,
        bankAccountId: body.bankAccountId ? String(body.bankAccountId) : undefined,
        postJournals: body.postJournals !== false,
      });
      return NextResponse.json({ success: true, asset });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Dispose failed",
        },
        { status: 400 }
      );
    }
  });
}
