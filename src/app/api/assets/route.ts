import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  deleteAsset,
  readAssetStore,
  upsertAsset,
} from "@/lib/accounting/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const store = await readAssetStore();
      const assets = [...store.assets].sort((a, b) =>
        a.number.localeCompare(b.number, undefined, { numeric: true })
      );
      const runs = [...store.runs].sort((a, b) =>
        String(b.to).localeCompare(String(a.to))
      );
      return NextResponse.json({ assets, runs });
    } catch (error) {
      console.error("Assets GET error:", error);
      return NextResponse.json(
        { error: "Failed to load assets" },
        { status: 500 }
      );
    }
  });
}

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json();
      const asset = await upsertAsset(body || {});
      return NextResponse.json({ success: true, asset });
    } catch (error) {
      console.error("Assets POST error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Save failed",
        },
        { status: 400 }
      );
    }
  });
}

export async function DELETE(req: Request) {
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
      const ok = await deleteAsset(id);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: "Asset not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Delete failed",
        },
        { status: 400 }
      );
    }
  });
}
