import { NextResponse } from "next/server";
import { deleteLedgerEntry } from "@/lib/accounting/store";
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
      // #region agent log
      fetch('http://127.0.0.1:7620/ingest/58ed654d-f6dd-4cb2-bdd8-01209344e92b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d182b0'},body:JSON.stringify({sessionId:'d182b0',runId:'journal-clear-all',hypothesisId:'H3',location:'api/ledger/delete/route.ts:POST',message:'batch delete requested',data:{requestedCount:ids.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      let deletedCount = 0;
      for (const id of ids) {
        const deleted = await deleteLedgerEntry(id);
        if (deleted) deletedCount += 1;
      }
      // #region agent log
      fetch('http://127.0.0.1:7620/ingest/58ed654d-f6dd-4cb2-bdd8-01209344e92b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d182b0'},body:JSON.stringify({sessionId:'d182b0',runId:'journal-clear-all',hypothesisId:'H4',location:'api/ledger/delete/route.ts:POST',message:'batch delete completed',data:{requestedCount:ids.length,deletedCount},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (deletedCount === 0) {
        return NextResponse.json({ error: "No entries were deleted" }, { status: 404 });
      }
      return NextResponse.json({ success: true, deletedCount });
    }

    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "id or ids is required" }, { status: 400 });
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
