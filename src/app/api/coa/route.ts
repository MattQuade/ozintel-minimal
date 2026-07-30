import { NextResponse } from "next/server";
import { readCoa, writeCoa, type CoaAccount } from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const accounts = await readCoa();
    return NextResponse.json(accounts);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  const access = await requireAccountingAccess(request);
  if (!access.ok) return access.response;

  try {
    const body = await request.json();
    const accounts = (Array.isArray(body) ? body : body.accounts) as CoaAccount[];
    if (!Array.isArray(accounts)) {
      return NextResponse.json(
        { success: false, error: "Expected an accounts array" },
        { status: 400 }
      );
    }
    await writeCoa(accounts);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
