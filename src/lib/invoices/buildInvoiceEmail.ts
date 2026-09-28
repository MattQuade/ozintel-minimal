import { formatAuDate } from "@/lib/accounting/dates";
import {
  computeLineTotals,
  isFreightLine,
  linesForInvoiceMath,
  round2,
  unitPriceInclGst,
} from "@/lib/accounting/invoiceMath";
import type { Invoice } from "@/lib/accounting/invoices";
import {
  INVOICE_BRAND,
  displayInvoiceNumber,
  fmtMoney,
  invoiceSubjectLine,
  lessLabel,
} from "@/lib/invoices/invoiceBrand";

function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildInvoiceEmail(
  invoice: Invoice,
  options?: { openPixelUrl?: string }
): {
  subject: string;
  text: string;
  html: string;
} {
  const brand = INVOICE_BRAND;
  const subjectLine = invoiceSubjectLine(invoice.subject);
  const orderDate = String(invoice.orderDate || "").trim();

  let subtotalIncl = 0;
  const productRows: string[] = [];
  const discountRows: string[] = [];
  const productText: string[] = [];
  const discountText: string[] = [];

  for (const line of linesForInvoiceMath(
    invoice.lines,
    invoice.pricesIncludeGst
  )) {
    const t = computeLineTotals(line);
    const unitIncl = unitPriceInclGst(line);
    const qty = Number(line.quantity) || 0;
    const desc = String(line.description || "").trim();
    if (t.isDiscount) {
      discountRows.push(
        `<tr><td colspan="3" style="padding-top:8px;font-weight:bold">${esc(lessLabel(desc))}</td><td style="text-align:right;padding-top:8px;font-weight:bold">${fmtMoney(t.incl)}</td></tr>`
      );
      discountText.push(`${lessLabel(desc)}  ${fmtMoney(t.incl)}`);
    } else {
      subtotalIncl = round2(subtotalIncl + t.incl);
      if (isFreightLine(line)) {
        productRows.push(
          `<tr><td colspan="3">Freight: ${Math.abs(qty)} x $${fmtMoney(unitIncl)} (incl. GST)</td><td style="text-align:right">${fmtMoney(t.incl)}</td></tr>`
        );
        productText.push(
          `Freight: ${Math.abs(qty)} x $${fmtMoney(unitIncl)} (incl. GST)  ${fmtMoney(t.incl)}`
        );
      } else {
        productRows.push(
          `<tr><td>${qty}</td><td>${esc(desc)}</td><td style="white-space:nowrap"><span style="display:inline-block;min-width:5.75em;text-align:right;font-variant-numeric:tabular-nums">${fmtMoney(unitIncl)}</span> (incl. GST)</td><td style="text-align:right">${fmtMoney(t.incl)}</td></tr>`
        );
        productText.push(
          `${qty}  ${desc}  ${fmtMoney(unitIncl)} (incl. GST)  ${fmtMoney(t.incl)}`
        );
      }
    }
  }

  const totalIncl = round2(invoice.total);
  const addrHtml = esc(brand.businessAddress).replace(/\n/g, "<br/>");

  const html = `<!DOCTYPE html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;font-size:15px;line-height:1.4">
  <div style="max-width:640px;margin:0 auto">
    <h1 style="text-align:center;font-size:18px;letter-spacing:0.08em">TAX INVOICE</h1>
    <p style="text-align:center;font-weight:bold;margin:0">${esc(brand.businessName)}</p>
    <p style="text-align:center;font-weight:bold;margin:4px 0 0">${addrHtml}</p>
    <p style="text-align:center;font-weight:bold;margin:16px 0 24px">ABN: ${esc(brand.abn)}</p>
    <table style="width:100%;border-collapse:collapse;font-weight:bold">
      <tr><td style="width:8rem">To:</td><td>${esc(invoice.customerName)}</td></tr>
      <tr><td>Date:</td><td>${esc(formatAuDate(invoice.issueDate))}</td></tr>
      ${orderDate ? `<tr><td>Order Date:</td><td>${esc(formatAuDate(orderDate))}</td></tr>` : ""}
      <tr><td>Invoice No.:</td><td>${esc(displayInvoiceNumber(invoice.number))}</td></tr>
      ${subjectLine ? `<tr><td>Subject:</td><td>${esc(subjectLine)}</td></tr>` : ""}
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:20px">
      ${productRows.join("")}
      <tr>
        <td colspan="3" style="padding-top:24px;font-weight:bold">Subtotal:</td>
        <td style="text-align:right;padding-top:24px;font-weight:bold">${fmtMoney(subtotalIncl)}</td>
      </tr>
      ${discountRows.join("")}
      <tr>
        <td colspan="3" style="padding-top:12px;font-weight:bold">Total (incl. GST):</td>
        <td style="text-align:right;padding-top:12px;font-weight:bold">${fmtMoney(totalIncl)}</td>
      </tr>
    </table>
    <p style="text-align:center;font-weight:bold;margin:28px 0">Thank you for your custom</p>
    <table style="border-collapse:collapse;font-weight:bold">
      <tr><td style="width:8rem">${esc(brand.bankName)}:</td><td>${esc(brand.bankAccountName)}</td></tr>
      <tr><td>BSB:</td><td>${esc(brand.bankBsb)}</td></tr>
      <tr><td>Account:</td><td>${esc(brand.bankAccount)}</td></tr>
    </table>
    <div style="font-size:15px;font-weight:normal;margin-top:20px;line-height:1.4">
      ${
        String(invoice.notes || "").trim()
          ? `<div>Notes: ${esc(String(invoice.notes).trim())}</div>`
          : ""
      }
      ${
        invoice.matchKeyword
          ? `<div>Payment Reference: ${esc(invoice.matchKeyword)}</div>`
          : ""
      }
      <div>Invoice generated by OzIntel Accounting · ozintel.com.au</div>
    </div>
    ${
      options?.openPixelUrl
        ? `<img src="${esc(options.openPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`
        : ""
    }
  </div>
</body></html>`;

  const text = [
    "TAX INVOICE",
    brand.businessName,
    brand.businessAddress,
    `ABN: ${brand.abn}`,
    "",
    `To: ${invoice.customerName}`,
    `Date: ${formatAuDate(invoice.issueDate)}`,
    orderDate ? `Order Date: ${formatAuDate(orderDate)}` : "",
    `Invoice No.: ${displayInvoiceNumber(invoice.number)}`,
    subjectLine ? `Subject: ${subjectLine}` : "",
    "",
    ...productText,
    "",
    `Subtotal: ${fmtMoney(subtotalIncl)}`,
    ...discountText,
    `Total (incl. GST): ${fmtMoney(totalIncl)}`,
    "",
    "Thank you for your custom",
    `${brand.bankName}: ${brand.bankAccountName}`,
    `BSB: ${brand.bankBsb}`,
    `Account: ${brand.bankAccount}`,
    String(invoice.notes || "").trim()
      ? `Notes: ${String(invoice.notes).trim()}`
      : "",
    invoice.matchKeyword
      ? `Payment Reference: ${invoice.matchKeyword}`
      : "",
    "Invoice generated by OzIntel Accounting · ozintel.com.au",
  ]
    .filter((line) => line !== "" && line != null)
    .join("\n");

  return {
    subject: `Tax Invoice ${displayInvoiceNumber(invoice.number)} — ${brand.businessName}`,
    text,
    html,
  };
}
