import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { getPayslipData } from "@/lib/accounting/payRuns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; employeeId: string }> };

export async function GET(req: Request, { params }: Params) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;

  try {
    const { id, employeeId } = await params;
    const data = await getPayslipData(id, employeeId);
    // Strip full TFN from API response for payslip print — show masked only
    const employee = data.employee
      ? {
          ...data.employee,
          tfn: data.employee.tfn
            ? `***${String(data.employee.tfn).replace(/\D/g, "").slice(-3)}`
            : "",
        }
      : null;
    return NextResponse.json({ ...data, employee });
  } catch (error) {
    console.error("Payslip GET error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load payslip",
      },
      { status: 404 }
    );
  }
}
