import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
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

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const BLACK = rgb(0, 0, 0);

function wrapLines(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function buildInvoicePdf(invoice: Invoice): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageW = A4[0];
  const pageH = A4[1];
  const contentW = pageW - MARGIN * 2;
  const right = pageW - MARGIN;

  let page: PDFPage = doc.addPage(A4);
  let y = pageH - MARGIN;

  const newPage = () => {
    page = doc.addPage(A4);
    y = pageH - MARGIN;
  };

  const ensure = (h: number) => {
    if (y - h < MARGIN) newPage();
  };

  const drawCentered = (text: string, size: number, font: PDFFont, gap = 4) => {
    const lines = String(text || "").split(/\n/);
    for (const line of lines) {
      const w = font.widthOfTextAtSize(line, size);
      ensure(size + gap);
      page.drawText(line, {
        x: (pageW - w) / 2,
        y: y - size,
        size,
        font,
        color: BLACK,
      });
      y -= size + gap;
    }
  };

  const drawText = (
    text: string,
    x: number,
    size: number,
    font: PDFFont,
    width?: number,
    align: "left" | "right" = "left"
  ) => {
    const lines = width
      ? wrapLines(text, font, size, width)
      : [text];
    const blockH = lines.length * (size + 3);
    ensure(blockH);
    const top = y;
    for (const line of lines) {
      const lineW = font.widthOfTextAtSize(line, size);
      const drawX =
        align === "right" && width != null ? x + width - lineW : x;
      page.drawText(line, {
        x: drawX,
        y: y - size,
        size,
        font,
        color: BLACK,
      });
      y -= size + 3;
    }
    return top;
  };

  const brand = INVOICE_BRAND;

  drawCentered("TAX INVOICE", 16, bold, 8);
  y -= 4;
  drawCentered(brand.businessName, 12, bold, 4);
  drawCentered(brand.businessAddress, 12, bold, 4);
  y -= 6;
  drawCentered(`ABN: ${brand.abn}`, 12, bold, 8);
  y -= 10;

  const meta: Array<[string, string]> = [
    ["To:", invoice.customerName],
    ["Date:", formatAuDate(invoice.issueDate)],
  ];
  const orderDate = String(invoice.orderDate || "").trim();
  if (orderDate) meta.push(["Order Date:", formatAuDate(orderDate)]);
  meta.push(["Invoice No.:", displayInvoiceNumber(invoice.number)]);
  const subject = invoiceSubjectLine(invoice.subject);
  if (subject) meta.push(["Subject:", subject]);

  for (const [label, value] of meta) {
    ensure(16);
    const rowY = y;
    page.drawText(label, {
      x: MARGIN,
      y: rowY - 12,
      size: 12,
      font: bold,
      color: BLACK,
    });
    y = rowY;
    drawText(value, MARGIN + 95, 12, bold, contentW - 95);
    y = Math.min(y, rowY - 16);
  }

  y -= 8;
  ensure(14);
  {
    const dollar = "$";
    const w = regular.widthOfTextAtSize(dollar, 10);
    page.drawText(dollar, {
      x: right - w,
      y: y - 10,
      size: 10,
      font: regular,
      color: BLACK,
    });
    y -= 16;
  }

  let subtotalIncl = 0;
  const discounts: Array<{ label: string; amount: number }> = [];

  for (const line of linesForInvoiceMath(
    invoice.lines,
    invoice.pricesIncludeGst
  )) {
    const t = computeLineTotals(line);
    const unitIncl = unitPriceInclGst(line);
    const qty = Number(line.quantity) || 0;
    const desc = String(line.description || "").trim();
    if (t.isDiscount) {
      discounts.push({ label: lessLabel(desc), amount: Math.abs(t.incl) });
      continue;
    }
    subtotalIncl = round2(subtotalIncl + t.incl);
    ensure(16);
    const rowTop = y;
    const amount = fmtMoney(t.incl);
    const amountW = regular.widthOfTextAtSize(amount, 11);
    if (isFreightLine(line)) {
      y = rowTop;
      drawText(
        `Freight: ${Math.abs(qty)} x $${fmtMoney(unitIncl)} (incl. GST)`,
        MARGIN,
        11,
        regular,
        contentW - 80
      );
    } else {
      page.drawText(String(qty), {
        x: MARGIN,
        y: rowTop - 11,
        size: 11,
        font: regular,
        color: BLACK,
      });
      const unit = `${fmtMoney(unitIncl)} (incl. GST)`;
      y = rowTop;
      drawText(desc, MARGIN + 40, 11, regular, contentW - 220);
      page.drawText(unit, {
        x: right - 175,
        y: rowTop - 11,
        size: 11,
        font: regular,
        color: BLACK,
      });
    }
    page.drawText(amount, {
      x: right - amountW,
      y: rowTop - 11,
      size: 11,
      font: regular,
      color: BLACK,
    });
    y = Math.min(y, rowTop - 16);
  }

  y -= 10;
  const writeTotal = (label: string, amount: string) => {
    ensure(16);
    const rowY = y;
    page.drawText(label, {
      x: MARGIN,
      y: rowY - 12,
      size: 12,
      font: bold,
      color: BLACK,
    });
    const w = bold.widthOfTextAtSize(amount, 12);
    page.drawText(amount, {
      x: right - w,
      y: rowY - 12,
      size: 12,
      font: bold,
      color: BLACK,
    });
    y = rowY - 18;
  };

  writeTotal("Subtotal:", fmtMoney(subtotalIncl));
  for (const d of discounts) {
    writeTotal(d.label, fmtMoney(d.amount));
  }
  writeTotal("Total (incl. GST):", fmtMoney(round2(invoice.total)));

  y -= 12;
  drawCentered("Thank you for your custom", 12, bold, 8);
  y -= 8;

  const bank: Array<[string, string]> = [
    [`${brand.bankName}:`, brand.bankAccountName],
    ["BSB:", brand.bankBsb],
    ["Account:", brand.bankAccount],
  ];
  for (const [label, value] of bank) {
    ensure(16);
    const rowY = y;
    page.drawText(label, {
      x: MARGIN,
      y: rowY - 12,
      size: 11,
      font: bold,
      color: BLACK,
    });
    y = rowY;
    drawText(value, MARGIN + 95, 11, bold, contentW - 95);
    y = Math.min(y, rowY - 16);
  }

  y -= 14;
  if (invoice.matchKeyword) {
    drawText(
      `Payment Reference: ${invoice.matchKeyword}`,
      MARGIN,
      9,
      regular,
      contentW
    );
  }
  drawText(
    "Invoice generated by OzIntel Accounting · ozintel.com.au",
    MARGIN,
    9,
    regular,
    contentW
  );

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
