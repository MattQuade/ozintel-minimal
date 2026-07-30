import { NextResponse } from "next/server";
import { updateLedgerEntry } from "@/lib/accounting/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const updated = await updateLedgerEntry({ ...body, id });
    return NextResponse.json({ success: true, entry: updated });
  } catch (err) {
    console.error(err);
    const message =
      err instanceof Error ? err.message : "Failed to update entry";
    const status = message === "Entry not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
