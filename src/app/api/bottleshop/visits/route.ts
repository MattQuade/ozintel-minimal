import { NextResponse } from "next/server";
import {
  readBottleShopVisits,
  recordBottleShopVisit,
} from "@/lib/bottleshop/visits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, max-age=0" };

/** Today's bottle shop opens, plus the recent days. One small file. */
export async function GET() {
  try {
    const visits = await readBottleShopVisits();
    return NextResponse.json({ success: true, ...visits }, { headers: noStore });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to read bottle shop opens" },
      { status: 500, headers: noStore }
    );
  }
}

/** Count one open of the public /bottleshop page. */
export async function POST() {
  try {
    const visit = await recordBottleShopVisit();
    return NextResponse.json({ success: true, ...visit }, { headers: noStore });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to record bottle shop open" },
      { status: 500, headers: noStore }
    );
  }
}
