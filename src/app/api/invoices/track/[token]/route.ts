import { NextResponse } from "next/server";
import {
  recordInvoiceEmailOpen,
} from "@/lib/accounting/invoices";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { parseInvoiceOpenToken } from "@/lib/invoices/sendInvoiceEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 1×1 transparent GIF */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

type Params = { params: Promise<{ token: string }> };

/**
 * Public open-tracking pixel for emailed invoices.
 * No auth — token is signed and scoped to one send.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { token: raw } = await params;
    const token = decodeURIComponent(String(raw || "").trim());
    const parsed = parseInvoiceOpenToken(token);
    if (parsed) {
      await runWithDataOwnerAsync(parsed.ownerEmail, async () => {
        await recordInvoiceEmailOpen(token);
      });
    }
  } catch (err) {
    console.error("Invoice open track error:", err);
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}
