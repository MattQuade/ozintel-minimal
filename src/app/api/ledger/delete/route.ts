import { NextResponse } from "next/server";
import {
  deleteLedgerEntry,
  deleteLedgerEntries,
} from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const body = await req.json();
    const ids = Array.isArray(body.ids)
      ? body.ids.map((id: unknown) => String(id || "").trim()).filter(Boolean)
      : [];
    if (ids.length > 0) {
      const deletedCount = await deleteLedgerEntries(ids);
      if (deletedCount === 0) {
        return NextResponse.json(
          { error: "No entries were deleted" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, deletedCount });
    }

    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json(
        { error: "id or ids is required" },
        { status: 400 }
      );
    }
    const deleted = await deleteLedgerEntry(id);
    if (!deleted) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to delete entry",
      },
      { status: 500 }
    );
  }
}
