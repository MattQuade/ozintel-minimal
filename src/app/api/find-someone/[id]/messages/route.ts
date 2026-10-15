import { NextRequest, NextResponse } from "next/server";
import { requireFindSomeoneAccess } from "@/lib/findSomeone/requireAccess";
import {
  getPost,
  isPartyOnPost,
  listMessages,
  postMessage,
} from "@/lib/findSomeone/store";
import { normalizeOwnerEmail } from "@/lib/dataOwnerContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function publicMessage(
  m: { id: string; fromEmail: string; body: string; createdAt: string },
  viewerEmail: string
) {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    mine: normalizeOwnerEmail(m.fromEmail) === normalizeOwnerEmail(viewerEmail),
  };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const access = await requireFindSomeoneAccess(req);
  if (!access.ok) return access.response;
  const { id } = await ctx.params;
  const post = await getPost(id);
  if (!post) {
    return NextResponse.json(
      { success: false, error: "Post not found" },
      { status: 404 }
    );
  }
  if (isPartyOnPost(post, access.email) === "none" || post.status !== "matched") {
    return NextResponse.json(
      { success: false, error: "Messaging not available for this post." },
      { status: 403 }
    );
  }
  const messages = await listMessages(id);
  return NextResponse.json({
    success: true,
    messages: messages.map((m) => publicMessage(m, access.email)),
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const access = await requireFindSomeoneAccess(req);
  if (!access.ok) return access.response;
  const { id } = await ctx.params;
  try {
    const body = await req.json().catch(() => ({}));
    const message = await postMessage({
      postId: id,
      fromEmail: access.email,
      body: String(body.body || ""),
    });
    const messages = await listMessages(id);
    return NextResponse.json({
      success: true,
      message: publicMessage(message, access.email),
      messages: messages.map((m) => publicMessage(m, access.email)),
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to send",
      },
      { status: 400 }
    );
  }
}
