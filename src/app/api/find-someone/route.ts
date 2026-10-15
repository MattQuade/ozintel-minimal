import { NextRequest, NextResponse } from "next/server";
import { requireFindSomeoneAccess } from "@/lib/findSomeone/requireAccess";
import {
  createPost,
  listPosts,
  publicPostCard,
} from "@/lib/findSomeone/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List open + recent posts (anonymous cards). */
export async function GET(req: NextRequest) {
  const access = await requireFindSomeoneAccess(req);
  if (!access.ok) return access.response;
  const posts = await listPosts();
  return NextResponse.json({
    success: true,
    posts: posts.map(publicPostCard),
  });
}

/** Create an anonymous Find Someone post. */
export async function POST(req: NextRequest) {
  const access = await requireFindSomeoneAccess(req);
  if (!access.ok) return access.response;
  try {
    const body = await req.json().catch(() => ({}));
    const post = await createPost({
      authorEmail: access.email,
      placeText: String(body.placeText || ""),
      approxDate: String(body.approxDate || ""),
      question: String(body.question || ""),
    });
    return NextResponse.json({
      success: true,
      post: publicPostCard(post),
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to create post",
      },
      { status: 400 }
    );
  }
}
