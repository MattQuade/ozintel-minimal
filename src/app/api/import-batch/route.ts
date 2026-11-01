import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/accounting/requireAccess";
import {
  addRowsToImportBatch,
  batchLineToLedgerEntry,
  linesReadyToCommit,
  readImportBatch,
  removeImportBatchLines,
  updateImportBatchLine,
  type ImportBatchLine,
} from "@/lib/accounting/importBatch";
import { appendLedgerEntries } from "@/lib/accounting/store";
import { readInvoices, tryAllocateLedgerDepositToInvoice, allocateBankDepositToInvoice } from "@/lib/accounting/invoices";
import { amountsMatch, isOpenForAllocation } from "@/lib/accounting/invoiceDepositMatch";
import { ensureFy26DoubleEntry } from "@/lib/accounting/ensureDoubleEntry";
import { registerLedgerEntryOnReceipts } from "@/lib/accounting/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toMatchShape(inv: {
  id: string;
  number: string;
  status: string;
  amountDue: number;
  matchKeyword?: string;
  customerName?: string;
  issueDate?: string;
}) {
  return {
    id: inv.id,
    number: inv.number,
    status: inv.status,
    amountDue: inv.amountDue,
    matchKeyword: inv.matchKeyword,
    customerName: inv.customerName,
    issueDate: inv.issueDate,
  };
}

export async function GET(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    const lines = await readImportBatch();
    return NextResponse.json({ lines });
  });
}

export async function POST(req: Request) {
  const access = await requireAccountingAccess(req);
  if (!access.ok) return access.response;
  return access.run(async () => {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "add") {
      const bankAccountId = String(body.bankAccountId || "").trim();
      if (!bankAccountId) {
        return NextResponse.json(
          { success: false, error: "Choose a bank account" },
          { status: 400 }
        );
      }
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const invoices = await readInvoices();
      const result = await addRowsToImportBatch({
        rows,
        bankAccountId,
        bankAccountName: String(body.bankAccountName || ""),
        quarter: String(body.quarter || ""),
        invoices: invoices.filter((inv) => isOpenForAllocation(toMatchShape(inv))).map(toMatchShape),
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "update") {
      const id = String(body.id || "").trim();
      if (!id) {
        return NextResponse.json(
          { success: false, error: "Missing line" },
          { status: 400 }
        );
      }
      const line = await updateImportBatchLine(id, body.patch || {});
      if (!line) {
        return NextResponse.json(
          { success: false, error: "Line not in the batch" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, line });
    }

    if (action === "commit") {
      const all = await readImportBatch();
      const wanted = Array.isArray(body.ids)
        ? new Set(body.ids.map((id: unknown) => String(id)))
        : null;
      const ready = linesReadyToCommit(all).filter((line) =>
        wanted ? wanted.has(line.id) : true
      );
      if (ready.length === 0) {
        return NextResponse.json({
          success: true,
          committed: 0,
          waiting: all.length,
          lines: all,
        });
      }
      const saved = await appendLedgerEntries(ready.map(batchLineToLedgerEntry));
      for (const entry of saved.savedEntries) {
        if (Array.isArray(entry.receiptIds) && entry.receiptIds.length > 0) {
          await registerLedgerEntryOnReceipts(entry.receiptIds, entry.id);
        }
      }
      const byFingerprint = new Map(
        ready.map((line, index) => [line.fingerprint, { line, entry: saved.savedEntries[index] }])
      );
      for (const { line, entry } of byFingerprint.values()) {
        if (!entry?.id || !(Number(entry.amount) > 0)) continue;
        if (line.invoiceId && !line.invoiceAutoMatched) {
          const invoices = await readInvoices();
          const inv = invoices.find((item) => item.id === line.invoiceId);
          if (inv && amountsMatch(line.amount, inv.amountDue)) {
            await allocateBankDepositToInvoice({
              invoiceId: inv.id,
              amount: line.amount,
              date: line.date,
              bankAccountId: line.bankAccountId,
              description: line.bankDescription,
              replaceLedgerEntryId: entry.id,
              autoMatched: false,
            }).catch(() => undefined);
            continue;
          }
        }
        await tryAllocateLedgerDepositToInvoice(entry);
      }
      await ensureFy26DoubleEntry();
      await removeImportBatchLines(ready.map((line) => line.id));
      const lines = await readImportBatch();
      return NextResponse.json({
        success: true,
        committed: ready.length,
        waiting: lines.length,
        lines,
      });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  });
}

export type { ImportBatchLine };
