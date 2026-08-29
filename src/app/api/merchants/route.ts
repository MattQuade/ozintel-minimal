import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import type { ApprovedMerchant } from "@/lib/accounting/approvedMerchants";
import {
  parseMerchantsUpload,
  readMerchants,
  syncMerchantsFromDefaults,
  writeMerchants,
} from "@/lib/accounting/merchants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    const merchants = await readMerchants();
    return NextResponse.json({ success: true, merchants });
  });
}

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json();
      if (body?.action === "syncDefaults") {
        const merchants = await syncMerchantsFromDefaults();
        return NextResponse.json({ success: true, merchants });
      }
      if (body?.action === "upload" || typeof body?.text === "string") {
        const merchants = parseMerchantsUpload(String(body.text || ""));
        if (merchants.length === 0) {
          return NextResponse.json(
            { success: false, error: "No shops found in that file." },
            { status: 400 }
          );
        }
        const saved = await writeMerchants(merchants);
        return NextResponse.json({ success: true, merchants: saved });
      }
      const incoming = (Array.isArray(body) ? body : body.merchants) as ApprovedMerchant[];
      if (!Array.isArray(incoming)) {
        return NextResponse.json(
          { success: false, error: "Expected a shops array" },
          { status: 400 }
        );
      }
      const merchants = await writeMerchants(incoming);
      return NextResponse.json({ success: true, merchants });
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        { success: false, error: "Could not save shops" },
        { status: 500 }
      );
    }
  });
}
