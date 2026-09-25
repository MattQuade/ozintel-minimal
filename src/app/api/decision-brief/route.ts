import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  ensureConnectCodePublished,
  readDecisionBriefStore,
  refreshEnergyFromAccounting,
  rotateConnectCode,
  writeDecisionBriefStore,
  buildEnergyBrief,
} from "@/lib/decisionBrief/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Load Decision Brief hub payload for the signed-in owner. */
export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const store = await readDecisionBriefStore();
      await ensureConnectCodePublished();
      return NextResponse.json({ success: true, store });
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        { success: false, error: "Failed to load Decision Brief" },
        { status: 500 }
      );
    }
  });
}

/**
 * Body: { action: "refreshEnergy" | "rotateCode" | "rebuildBrief" }
 */
export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    try {
      const body = await req.json().catch(() => ({}));
      const action = String(body.action || "").trim();
      if (action === "refreshEnergy") {
        const energy = await refreshEnergyFromAccounting();
        const store = await readDecisionBriefStore();
        return NextResponse.json({ success: true, energy, store });
      }
      if (action === "rotateCode") {
        const code = await rotateConnectCode();
        await ensureConnectCodePublished();
        const store = await readDecisionBriefStore();
        return NextResponse.json({ success: true, connectCode: code, store });
      }
      if (action === "rebuildBrief") {
        const store = await readDecisionBriefStore();
        store.brief = buildEnergyBrief(store);
        await writeDecisionBriefStore(store);
        return NextResponse.json({ success: true, store });
      }
      return NextResponse.json(
        { success: false, error: "Unknown action" },
        { status: 400 }
      );
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        {
          success: false,
          error:
            err instanceof Error ? err.message : "Decision Brief action failed",
        },
        { status: 400 }
      );
    }
  });
}
