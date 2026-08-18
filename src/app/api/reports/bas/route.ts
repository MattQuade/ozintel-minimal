import { NextResponse } from "next/server";
import { readCoa, readLedger } from "@/lib/accounting/store";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { readPayRuns } from "@/lib/accounting/payRuns";
import {
  buildBasSummary,
  currentBasQuarterId,
  listBasQuarterOptions,
} from "@/lib/accounting/reports";
import {
  GST_METHOD,
  type BasBoxId,
} from "@/lib/accounting/gstTax";
import {
  periodByQuarterId,
  readAccountingSettings,
  readBasPeriods,
  upsertBasPeriod,
  type BasPeriodRecord,
} from "@/lib/accounting/basPeriods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function liveBas(from: string, to: string) {
  const [entries, coa, payRuns, settings] = await Promise.all([
    readLedger(),
    readCoa(),
    readPayRuns(),
    readAccountingSettings(),
  ]);
  const report = buildBasSummary(entries, coa, from, to, payRuns);
  return { ...report, gstMethod: settings.gstMethod || GST_METHOD };
}

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const url = new URL(req.url);
      const quarters = listBasQuarterOptions();
      const defaultId = currentBasQuarterId();
      const quarterId = url.searchParams.get("quarter") || defaultId;
      const matched =
        quarters.find((q) => q.id === quarterId) ||
        quarters.find((q) => q.id === defaultId) ||
        quarters[0];

      const from = url.searchParams.get("from") || matched?.from || "";
      const to = url.searchParams.get("to") || matched?.to || "";
      const boxId = url.searchParams.get("box") as BasBoxId | null;

      const periods = await readBasPeriods();
      const stored = periodByQuarterId(periods, matched?.id || "");
      const frozen =
        stored &&
        (stored.status === "locked" || stored.status === "lodged") &&
        stored.snapshot
          ? stored.snapshot
          : null;

      const report = frozen || (await liveBas(from, to));
      const boxes = Array.isArray((report as { boxes?: unknown }).boxes)
        ? (report as { boxes: Array<{ id: string; lines?: unknown[] }> }).boxes
        : [];

      if (boxId) {
        const found = boxes.find((b) => b.id === boxId);
        return NextResponse.json({
          success: true,
          box: found || { id: boxId, lines: [], amount: 0, lineCount: 0 },
          selectedQuarterId: matched?.id || "",
          periodStatus: stored?.status || "open",
        });
      }

      return NextResponse.json({
        ...report,
        quarters,
        selectedQuarterId: matched?.id || "",
        periodStatus: stored?.status || "open",
        lockedAt: stored?.lockedAt,
        lodgedAt: stored?.lodgedAt,
        liveSuperseded: Boolean(frozen),
      });
    } catch (error) {
      console.error("BAS Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to build BAS summary" },
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
      const body = (await req.json()) as {
        action?: string;
        quarterId?: string;
      };
      const action = String(body.action || "").trim();
      const quarters = listBasQuarterOptions();
      const quarterId = String(body.quarterId || "").trim();
      const matched = quarters.find((q) => q.id === quarterId);
      if (!matched) {
        return NextResponse.json(
          { success: false, error: "Unknown quarter" },
          { status: 400 }
        );
      }

      const periods = await readBasPeriods();
      const existing = periodByQuarterId(periods, quarterId);
      const now = new Date().toISOString();

      if (action === "lock") {
        if (existing?.status === "lodged") {
          return NextResponse.json(
            { success: false, error: "Lodged quarters cannot be re-locked from live data" },
            { status: 400 }
          );
        }
        const snapshot = await liveBas(matched.from, matched.to);
        const row: BasPeriodRecord = {
          quarterId,
          from: matched.from,
          to: matched.to,
          label: matched.label,
          status: "locked",
          gstMethod: GST_METHOD,
          snapshot: snapshot as unknown as Record<string, unknown>,
          lockedAt: now,
          lodgedAt: existing?.lodgedAt,
        };
        await upsertBasPeriod(row);
        return NextResponse.json({ success: true, period: row });
      }

      if (action === "unlock") {
        if (existing?.status === "lodged") {
          return NextResponse.json(
            {
              success: false,
              error: "This quarter is marked lodged. Ask the accountant before unlocking.",
            },
            { status: 400 }
          );
        }
        const row: BasPeriodRecord = {
          quarterId,
          from: matched.from,
          to: matched.to,
          label: matched.label,
          status: "open",
          gstMethod: GST_METHOD,
          snapshot: existing?.snapshot || null,
          lockedAt: existing?.lockedAt,
          unlockedAt: now,
        };
        await upsertBasPeriod(row);
        return NextResponse.json({ success: true, period: row });
      }

      if (action === "lodge") {
        const snapshot =
          existing?.snapshot && existing.status === "locked"
            ? existing.snapshot
            : ((await liveBas(matched.from, matched.to)) as unknown as Record<
                string,
                unknown
              >);
        const row: BasPeriodRecord = {
          quarterId,
          from: matched.from,
          to: matched.to,
          label: matched.label,
          status: "lodged",
          gstMethod: GST_METHOD,
          snapshot,
          lockedAt: existing?.lockedAt || now,
          lodgedAt: now,
        };
        await upsertBasPeriod(row);
        return NextResponse.json({ success: true, period: row });
      }

      return NextResponse.json(
        { success: false, error: "action must be lock, unlock, or lodge" },
        { status: 400 }
      );
    } catch (error) {
      console.error("BAS lock error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "BAS action failed",
        },
        { status: 500 }
      );
    }
  });
}
