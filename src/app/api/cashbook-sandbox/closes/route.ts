import { NextRequest, NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  getCashbookSandboxCloseByEftposDate,
  listCashbookSandboxCloses,
  upsertCashbookSandboxClose,
} from "@/lib/cashbookSandbox/store";
import { listSandboxCashOuts } from "@/lib/cashbookSandbox/cashOut";
import {
  addSandboxMiscPayment,
  listSandboxMiscPayments,
  removeSandboxMiscPayment,
} from "@/lib/cashbookSandbox/miscPayments";
import {
  addSandboxInvoice,
  listSandboxInvoices,
  removeSandboxInvoice,
} from "@/lib/cashbookSandbox/invoices";
import { sydneyTodayIso } from "@/lib/cashbookSandbox/sydneyDate";

function pairError(
  name: string,
  rawAmount: unknown,
  missingName: string,
  missingAmount: string
): string | null {
  const hasAmount = rawAmount != null && String(rawAmount).trim() !== "";
  const amount = Number(rawAmount);
  if (!name && !hasAmount) return null;
  if (!name) return missingName;
  if (!hasAmount || !Number.isFinite(amount) || amount <= 0) return missingAmount;
  return null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?date=YYYY-MM-DD — one night, or all recent sandbox closes. */
export async function GET(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    const date = req.nextUrl.searchParams.get("date")?.trim() || "";
    if (date) {
      const entry = await getCashbookSandboxCloseByEftposDate(date);
      return NextResponse.json({
        success: true,
        sandbox: true,
        today: sydneyTodayIso(),
        entry,
      });
    }
    const entries = await listCashbookSandboxCloses();
    const cashOuts = await listSandboxCashOuts();
    const miscPayments = await listSandboxMiscPayments();
    const invoices = await listSandboxInvoices();
    return NextResponse.json({
      success: true,
      sandbox: true,
      today: sydneyTodayIso(),
      entries,
      cashOuts,
      miscPayments,
      invoices,
    });
  });
}

/** POST — save EFTPOS night + optional cash banked into sandbox only. */
export async function POST(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }
    const payee = String(body.miscPayee || "").trim();
    const customer = String(body.invoiceCustomer || "").trim();
    const payError = pairError(
      payee,
      body.miscAmount,
      "Enter who was paid",
      "Enter the amount paid"
    );
    const invoiceError = pairError(
      customer,
      body.invoiceAmount,
      "Enter the customer",
      "Enter the invoice amount"
    );
    if (payError || invoiceError) {
      return NextResponse.json(
        { success: false, error: payError || invoiceError },
        { status: 400 }
      );
    }
    const entry = await upsertCashbookSandboxClose({
      eftposDate: typeof body.eftposDate === "string" ? body.eftposDate : undefined,
      eftpos1: body.eftpos1,
      eftpos2: body.eftpos2,
      eftpos3: body.eftpos3,
      cashDepositDate: body.cashDepositDate,
      cashDeposit: body.cashDeposit,
    });
    const miscPayment = payee
      ? await addSandboxMiscPayment({
          payee,
          amount: body.miscAmount,
        })
      : null;
    const invoice = customer
      ? await addSandboxInvoice({
          customer,
          amount: body.invoiceAmount,
        })
      : null;
    return NextResponse.json({
      success: true,
      sandbox: true,
      entry,
      miscPayment,
      invoice,
    });
  });
}

/** DELETE ?id= — remove one sandbox misc payment. */
export async function DELETE(req: NextRequest) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    const id = req.nextUrl.searchParams.get("id")?.trim() || "";
    const kind = req.nextUrl.searchParams.get("kind")?.trim() || "";
    const removed =
      kind === "invoice"
        ? await removeSandboxInvoice(id)
        : await removeSandboxMiscPayment(id);
    if (!removed) {
      return NextResponse.json(
        { success: false, error: "Payment not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, sandbox: true });
  });
}
