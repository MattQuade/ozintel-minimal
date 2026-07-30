import { NextResponse } from "next/server";
import { readRules, writeRules, type BankRule } from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const rules = await readRules();
    return NextResponse.json(rules);
  } catch (error) {
    console.error(error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireAccountingAccess(request);
  if (!access.ok) return access.response;

  try {
    const body = await request.json();
    const newRules = (Array.isArray(body) ? body : body.rules) as BankRule[];
    if (!Array.isArray(newRules)) {
      return NextResponse.json(
        { success: false, error: "Expected a rules array" },
        { status: 400 }
      );
    }
    await writeRules(newRules);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
