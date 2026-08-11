import { NextRequest, NextResponse } from "next/server";
import {
  addKegEntry,
  deleteKegEntry,
  listArchiveMonths,
  loadCurrentMonth,
  updateKegEntry,
  type KegType,
} from "@/lib/operations/pub/kegs";
import { requireOpsAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const { store, totals, archivedPrevious } = await loadCurrentMonth();
      const archives = await listArchiveMonths();
    return NextResponse.json({
      success: true,
      month: store.month,
      totals,
      entries: [...store.entries].reverse(),
      archives,
      archivedPrevious,
      dataOwnerEmail: access.dataOwnerEmail,
    });
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        { success: false, error: "Failed to load keg tracker" },
        { status: 500 }
      );
    }
  });
}

export async function POST(req: NextRequest) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json();
      const type = String(body.type || "").toLowerCase() as KegType;
      if (type !== "in" && type !== "out") {
        return NextResponse.json(
          { success: false, error: 'type must be "in" or "out"' },
          { status: 400 }
        );
      }
      const result = await addKegEntry({
        type,
        quantity: Number(body.quantity),
        date: body.date ? String(body.date) : undefined,
      });
      return NextResponse.json({
        success: true,
        month: result.store.month,
        totals: result.totals,
        entries: [...result.store.entries].reverse(),
      });
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to add entry",
        },
        { status: 400 }
      );
    }
  });
}

export async function PATCH(req: NextRequest) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json();
      const id = String(body.id || "").trim();
      if (!id) {
        return NextResponse.json(
          { success: false, error: "id is required" },
          { status: 400 }
        );
      }
      const result = await updateKegEntry(id, Number(body.quantity));
      return NextResponse.json({
        success: true,
        month: result.store.month,
        totals: result.totals,
        entries: [...result.store.entries].reverse(),
      });
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to update entry",
        },
        { status: 400 }
      );
    }
  });
}

export async function DELETE(req: NextRequest) {
  const access = await requireOpsAccess(req, "pubOps");
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const { searchParams } = new URL(req.url);
      let id = searchParams.get("id") || "";
      if (!id) {
        try {
          const body = await req.json();
          id = String(body.id || "");
        } catch {
          // no body
        }
      }
      id = id.trim();
      if (!id) {
        return NextResponse.json(
          { success: false, error: "id is required" },
          { status: 400 }
        );
      }
      const result = await deleteKegEntry(id);
      return NextResponse.json({
        success: true,
        month: result.store.month,
        totals: result.totals,
        entries: [...result.store.entries].reverse(),
      });
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to delete entry",
        },
        { status: 400 }
      );
    }
  });
}
