import { NextResponse } from "next/server";
import { appendLedgerEntries } from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const body = await req.json();
    const entries = Array.isArray(body.entries) ? body.entries : body;

    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: "No entries received" }, { status: 400 });
    }

    // #region agent log
    fetch('http://127.0.0.1:7620/ingest/58ed654d-f6dd-4cb2-bdd8-01209344e92b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d182b0'},body:JSON.stringify({sessionId:'d182b0',runId:'ledger-save',hypothesisId:'H5',location:'api/ledger/add/route.ts:POST',message:'ledger add received entries',data:{entryCount:entries.length,firstEntry:entries[0]?{date:entries[0].date,amount:entries[0].amount,accountCode:entries[0].accountCode,type:entries[0].type}:null,lastEntry:entries[entries.length-1]?{date:entries[entries.length-1].date,amount:entries[entries.length-1].amount,accountCode:entries[entries.length-1].accountCode,type:entries[entries.length-1].type}:null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const result = await appendLedgerEntries(entries);
    console.log(
      `Saved ${result.saved} transactions. Total now: ${result.total}`
    );

    return NextResponse.json({
      success: true,
      saved: result.saved,
      total: result.total,
    });
  } catch (err: unknown) {
    console.error("Save Error:", err);
    // #region agent log
    fetch('http://127.0.0.1:7620/ingest/58ed654d-f6dd-4cb2-bdd8-01209344e92b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d182b0'},body:JSON.stringify({sessionId:'d182b0',runId:'ledger-save',hypothesisId:'H6',location:'api/ledger/add/route.ts:POST',message:'ledger add threw server error',data:{error:err instanceof Error ? err.message : String(err)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to save to ledger",
      },
      { status: 500 }
    );
  }
}
