import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  createDraftFromPreviousPayRun,
  getPreviousPayRunTemplate,
  nextPayPeriodFrom,
} from "@/lib/accounting/payRuns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Preview which pay run would be copied and the next period dates. */
export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const url = new URL(req.url);
      const fromPayRunId = String(
        url.searchParams.get("fromPayRunId") || ""
      ).trim();
      const template = await getPreviousPayRunTemplate(
        fromPayRunId || undefined
      );
      if (!template) {
        return NextResponse.json({ template: null, nextPeriod: null });
      }
      return NextResponse.json({
        template: {
          id: template.id,
          number: template.number,
          periodStart: template.periodStart,
          periodEnd: template.periodEnd,
          paymentDate: template.paymentDate,
          frequency: template.frequency,
          status: template.status,
          employeeCount: template.totals?.employeeCount ?? template.lines.length,
        },
        nextPeriod: nextPayPeriodFrom(template),
      });
    } catch (error) {
      console.error("Pay run from-previous GET error:", error);
      return NextResponse.json(
        { error: "Failed to preview previous pay run" },
        { status: 500 }
      );
    }
  });
}

/**
 * Create a draft pay run by copying a previous one.
 * Body: { fromPayRunId? } — omit to use the most recent usable run.
 */
export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json().catch(() => ({}));
      const fromPayRunId = String(body.fromPayRunId || "").trim();
      const result = await createDraftFromPreviousPayRun(
        fromPayRunId || undefined
      );
      return NextResponse.json({
        success: true,
        payRun: result.payRun,
        fromPayRunNumber: result.fromPayRunNumber,
      });
    } catch (error) {
      console.error("Pay run from-previous POST error:", error);
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to create draft from previous pay run",
        },
        { status: 400 }
      );
    }
  });
}
