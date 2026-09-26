import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  appendSchemeUpdates,
  pruneFailedSchemeUpdates,
} from "@/lib/decisionBrief/store";
import { scanSchemeSources } from "@/lib/decisionBrief/scanUpdates";
import {
  runWithDataOwnerAsync,
  normalizeOwnerEmail,
} from "@/lib/dataOwnerContext";
import { promises as fs } from "fs";
import { getDecisionBriefGlobalDir } from "@/lib/dataPaths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function scanSecretOk(req: Request): boolean {
  const expected = String(process.env.DECISION_BRIEF_SCAN_SECRET || "").trim();
  if (!expected) return false;
  const header = req.headers.get("x-ozintel-scan-secret") || "";
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  return header === expected || bearer === expected;
}

async function listDecisionBriefOwners(): Promise<string[]> {
  const root = getDecisionBriefGlobalDir();
  try {
    const index = JSON.parse(
      await fs.readFile(`${root}/connect-index.json`, "utf8")
    ) as Record<string, string>;
    return [...new Set(Object.values(index).map(normalizeOwnerEmail))].filter(
      Boolean
    );
  } catch {
    return [];
  }
}

/**
 * Scan curated scheme sources and attach updates to Decision Brief silos.
 * Auth: accounting session (manual) OR x-ozintel-scan-secret (cron).
 * Cron with secret refreshes every owner that has published a connect code.
 */
export async function POST(req: Request) {
  const secretMode = scanSecretOk(req);
  if (!secretMode) {
    const access = await requireAccountingAccess(req);
    if (!access.ok) return access.response;
    return access.run(async () => {
      // Clear sticky unreachable rows before merging this scan.
      await pruneFailedSchemeUpdates();
      const updates = await scanSchemeSources();
      const store = await appendSchemeUpdates(updates);
      const ok = updates.filter((u) => u.status === "ok").length;
      const failed = updates.length - ok;
      return NextResponse.json({
        success: true,
        scanned: updates.length,
        ok,
        failed,
        store,
      });
    });
  }

  try {
    const updates = await scanSchemeSources();
    const owners = await listDecisionBriefOwners();
    let updatedOwners = 0;
    for (const owner of owners) {
      await runWithDataOwnerAsync(owner, async () => {
        await pruneFailedSchemeUpdates();
        await appendSchemeUpdates(updates);
        updatedOwners += 1;
      });
    }
    const ok = updates.filter((u) => u.status === "ok").length;
    return NextResponse.json({
      success: true,
      scanned: updates.length,
      ok,
      failed: updates.length - ok,
      updatedOwners,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Scan failed",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  if (!scanSecretOk(req)) {
    return NextResponse.json(
      { success: false, error: "Scan secret required" },
      { status: 401 }
    );
  }
  return POST(req);
}
