import { NextRequest, NextResponse } from "next/server";
import {
  ensureBankFeed,
  rotateBankFeedToken,
  saveBankFeedSecret,
  secretHint,
} from "@/lib/accounting/bankFeed";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import { publicSiteOrigin } from "@/lib/publicOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function feedUrl(req: NextRequest, token: string): string {
  return `${publicSiteOrigin(req)}/api/accounting/bank/feed/${token}`;
}

export async function GET(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    const config = await ensureBankFeed(access.user.email);
    return NextResponse.json(
      {
        url: feedUrl(req, config.token),
        secretSet: Boolean(config.signingSecret),
        secretHint: secretHint(config.signingSecret),
      },
      { headers: noStore }
    );
  });
}

export async function POST(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    try {
      if (action === "secret") {
        const config = await saveBankFeedSecret(String(body.signingSecret || ""));
        return NextResponse.json(
          {
            success: true,
            url: feedUrl(req, config.token),
            secretSet: true,
            secretHint: secretHint(config.signingSecret),
          },
          { headers: noStore }
        );
      }
      if (action === "rotate") {
        const config = await rotateBankFeedToken(access.user.email);
        return NextResponse.json(
          {
            success: true,
            url: feedUrl(req, config.token),
            secretSet: Boolean(config.signingSecret),
            secretHint: secretHint(config.signingSecret),
          },
          { headers: noStore }
        );
      }
      const config = await ensureBankFeed(access.user.email);
      return NextResponse.json(
        {
          success: true,
          url: feedUrl(req, config.token),
          secretSet: Boolean(config.signingSecret),
          secretHint: secretHint(config.signingSecret),
        },
        { headers: noStore }
      );
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Could not save the feed",
        },
        { status: 400, headers: noStore }
      );
    }
  });
}
