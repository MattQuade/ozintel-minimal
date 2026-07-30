import { NextResponse } from "next/server";
import { readCoa, writeCoa, type CoaAccount } from "@/lib/accounting/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const accounts = await readCoa();
    return NextResponse.json(accounts);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
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
