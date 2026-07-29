import { NextRequest, NextResponse } from "next/server";
import {
  addKegsIn,
  addKegsOut,
  getKegTotals,
} from "@/lib/operations/pub/kegs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const totals = await getKegTotals();
    return NextResponse.json({ success: true, ...totals });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to load keg totals" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = String(body.type || "").toLowerCase();
    const quantity = Number(body.quantity);

    if (type !== "in" && type !== "out") {
      return NextResponse.json(
        { success: false, error: 'type must be "in" or "out"' },
        { status: 400 }
      );
    }

    const totals =
      type === "in" ? await addKegsIn(quantity) : await addKegsOut(quantity);

    return NextResponse.json({ success: true, ...totals });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update kegs",
      },
      { status: 400 }
    );
  }
}
