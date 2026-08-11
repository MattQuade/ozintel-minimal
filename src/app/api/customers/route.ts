import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  deleteCustomer,
  readCustomers,
  upsertCustomer,
} from "@/lib/accounting/customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const customers = await readCustomers();
      customers.sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json(customers);
    } catch (error) {
      console.error("Customers GET error:", error);
      return NextResponse.json(
        { error: "Failed to load customers" },
        { status: 500 }
      );
    }
  });
}

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json();
      const customer = await upsertCustomer(body || {});
      return NextResponse.json({ success: true, customer });
    } catch (error) {
      console.error("Customers POST error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Save failed",
        },
        { status: 400 }
      );
    }
  });
}

export async function DELETE(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json().catch(() => ({}));
      const id = String(body.id || "").trim();
      if (!id) {
        return NextResponse.json(
          { success: false, error: "id required" },
          { status: 400 }
        );
      }
      const ok = await deleteCustomer(id);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: "Customer not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("Customers DELETE error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Delete failed",
        },
        { status: 500 }
      );
    }
  });
}
