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
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to save to ledger",
      },
      { status: 500 }
    );
  }
}
