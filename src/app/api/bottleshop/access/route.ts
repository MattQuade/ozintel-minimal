import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Invite codes removed — restore with a username on /bottleshop instead. */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Invite codes are no longer used. Restore with your username (e.g. tbong@ozintel).",
    },
    { status: 410 }
  );
}
