import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  createDraftFromCustomerLast,
  getLastInvoiceForCustomer,
} from "@/lib/accounting/invoices";
import { readCustomers } from "@/lib/accounting/customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Preview last invoice for a customer (for form prefill). */
export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const url = new URL(req.url);
      const customerId = String(url.searchParams.get("customerId") || "").trim();
      if (!customerId) {
        return NextResponse.json(
          { error: "customerId required" },
          { status: 400 }
        );
      }
      const invoice = await getLastInvoiceForCustomer(customerId);
      if (!invoice) {
        return NextResponse.json({ invoice: null });
      }
      return NextResponse.json({ invoice });
    } catch (error) {
      console.error("Invoice from-last GET error:", error);
      return NextResponse.json(
        { error: "Failed to load last invoice" },
        { status: 500 }
      );
    }
  });
}

/**
 * Create/refresh a draft from the customer's last invoice.
 * Body: { customerId } or { customerName } (case-insensitive contains/exact).
 */
export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json().catch(() => ({}));
      let customerId = String(body.customerId || "").trim();
      const customerName = String(body.customerName || "").trim();

      if (!customerId && customerName) {
        const customers = await readCustomers();
        const needle = customerName.toLowerCase();
        const exact = customers.find(
          (c) => c.name.trim().toLowerCase() === needle
        );
        const partial =
          exact ||
          customers.find((c) => c.name.toLowerCase().includes(needle));
        if (!partial) {
          return NextResponse.json(
            {
              success: false,
              error: `Customer not found: ${customerName}`,
            },
            { status: 404 }
          );
        }
        customerId = partial.id;
      }

      if (!customerId) {
        return NextResponse.json(
          { success: false, error: "customerId or customerName required" },
          { status: 400 }
        );
      }

      const result = await createDraftFromCustomerLast(customerId);
      return NextResponse.json({
        success: true,
        invoice: result.invoice,
        reusedDraft: result.reusedDraft,
        fromInvoiceNumber: result.fromInvoiceNumber,
      });
    } catch (error) {
      console.error("Invoice from-last POST error:", error);
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to create draft",
        },
        { status: 400 }
      );
    }
  });
}
