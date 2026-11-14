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
  const text = rawAmount == null ? "" : String(rawAmount).trim();
  const amount = Number(text);
  const hasAmount = text !== "" && Number.isFinite(amount) && amount > 0;
  if (!name && !hasAmount) return null;
  if (!name) return missingName;
  if (!hasAmount) return missingAmount;
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
    const merge = body.merge === true;
    const patch: {
      merge?: boolean;
      eftposDate?: string;
      eftpos1?: unknown;
      eftpos2?: unknown;
      eftpos3?: unknown;
      cashDepositDate?: unknown;
      cashDeposit?: unknown;
    } = {
      merge,
      eftposDate: typeof body.eftposDate === "string" ? body.eftposDate : undefined,
    };
    if (!merge || "eftpos1" in body) patch.eftpos1 = body.eftpos1;
    if (!merge || "eftpos2" in body) patch.eftpos2 = body.eftpos2;
    if (!merge || "eftpos3" in body) patch.eftpos3 = body.eftpos3;
    if (!merge || "cashDepositDate" in body) patch.cashDepositDate = body.cashDepositDate;
    if (!merge || "cashDeposit" in body) patch.cashDeposit = body.cashDeposit;
    const entry = await upsertCashbookSandboxClose(patch);
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
