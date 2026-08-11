import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  deleteEmployee,
  readEmployees,
  upsertEmployee,
} from "@/lib/accounting/employees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const employees = await readEmployees();
      employees.sort((a, b) =>
        `${a.legalLastName} ${a.legalFirstName}`.localeCompare(
          `${b.legalLastName} ${b.legalFirstName}`
        )
      );
      return NextResponse.json(employees);
    } catch (error) {
      console.error("Employees GET error:", error);
      return NextResponse.json(
        { error: "Failed to load employees" },
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
      // Never log TFN / bank details from body
      const employee = await upsertEmployee(body || {});
      return NextResponse.json({ success: true, employee });
    } catch (error) {
      console.error("Employees POST error:", error instanceof Error ? error.message : "Save failed");
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
      const ok = await deleteEmployee(id);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: "Employee not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("Employees DELETE error:", error);
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
