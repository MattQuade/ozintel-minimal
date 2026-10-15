import { NextRequest, NextResponse } from "next/server";
import { requireFindSomeoneAccess } from "@/lib/findSomeone/requireAccess";
import {
  acceptAnswer,
  buildPostDetail,
  submitAnswer,
} from "@/lib/findSomeone/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const access = await requireFindSomeoneAccess(req);
  if (!access.ok) return access.response;
  const { id } = await ctx.params;
  const detail = await buildPostDetail({
    postId: id,
    viewerEmail: access.email,
  });
  if (!detail) {
    return NextResponse.json(
      { success: false, error: "Post not found" },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, ...detail });
}

/**
 * Body: { action: "answer" | "accept", answerText?, answerId? }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const access = await requireFindSomeoneAccess(req);
  if (!access.ok) return access.response;
  const { id } = await ctx.params;
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").trim();

    if (action === "answer") {
      await submitAnswer({
        postId: id,
        responderEmail: access.email,
        answerText: String(body.answerText || ""),
      });
      const detail = await buildPostDetail({
        postId: id,
        viewerEmail: access.email,
      });
      return NextResponse.json({ success: true, ...detail });
    }

    if (action === "accept") {
      await acceptAnswer({
        postId: id,
        answerId: String(body.answerId || ""),
        authorEmail: access.email,
      });
      const detail = await buildPostDetail({
        postId: id,
        viewerEmail: access.email,
      });
      return NextResponse.json({ success: true, ...detail });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Action failed",
      },
      { status: 400 }
    );
  }
}
