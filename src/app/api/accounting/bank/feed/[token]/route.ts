import { NextResponse } from "next/server";
import {
  isFeedToken,
  ownerEmailForFeedToken,
  receiveBankFeedDelivery,
} from "@/lib/accounting/bankFeed";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { findUserByEmail } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/**
 * Redbark webhook. The token in the path is the registered user's own feed
 * address. The body is accepted only when the Redbark signing secret matches.
 * Rows land in that user's import batch. They are not posted to the journal.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!isFeedToken(token)) {
    return NextResponse.json({ received: false }, { status: 404, headers: noStore });
  }

  const owner = await ownerEmailForFeedToken(token);
  if (!owner) {
    return NextResponse.json({ received: false }, { status: 404, headers: noStore });
  }

  const user = await findUserByEmail(owner);
  if (!user || user.status !== "approved" || !user.permissions?.accounting) {
    return NextResponse.json({ received: false }, { status: 403, headers: noStore });
  }

  const rawBody = await req.text();
  const result = await runWithDataOwnerAsync(owner, () =>
    receiveBankFeedDelivery({
      token,
      timestamp: req.headers.get("x-redbark-timestamp") || "",
      signature: req.headers.get("x-redbark-signature") || "",
      deliveryId: req.headers.get("x-redbark-delivery-id") || "",
      rawBody,
    })
  );

  if (result.status !== 200) {
    return NextResponse.json(
      { received: false },
      { status: result.status, headers: noStore }
    );
  }

  return NextResponse.json(
    {
      received: true,
      added: result.added,
      skipped: result.skipped,
      pending: result.pending,
      duplicate: result.duplicate,
      ignored: result.ignored,
    },
    { headers: noStore }
  );
}
