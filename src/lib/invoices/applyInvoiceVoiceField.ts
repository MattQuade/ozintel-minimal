import { readCoa, type CoaAccount } from "@/lib/accounting/store";
import {
  upsertInvoice,
  type Invoice,
  type InvoiceLine,
} from "@/lib/accounting/invoices";
import { titleCaseSubject } from "@/lib/invoices/invoiceBrand";
import { parseSpokenDate } from "@/lib/voice/spokenDate";
import { parseSpokenAmount } from "@/lib/voice/spokenNumberSuffix";

export type InvoiceVoiceField =
  | "issueDate"
  | "orderDate"
  | "dueDate"
  | "subject"
  | "matchKeyword"
  | "notes"
  | "description"
  | "quantity"
  | "unitPrice"
  | "account"
  | "tax";

export const LINE_VOICE_FIELDS: InvoiceVoiceField[] = [
  "description",
  "quantity",
  "unitPrice",
  "account",
  "tax",
];

function scoreText(query: string, name: string): number {
  const q = String(query || "").toLowerCase().replace(/\s+/g, " ").trim();
  const n = String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.startsWith(q) || q.startsWith(n)) return 90;
  if (n.includes(q)) return 80;
  if (q.includes(n) && n.length >= 3) return 70;
  const qWords = q.split(/\s+/).filter((w) => w.length > 1);
  if (!qWords.length) return 0;
  const nWords = n.split(/\s+/);
  let hits = 0;
  for (const w of qWords) {
    if (nWords.some((nw) => nw === w || nw.startsWith(w) || w.startsWith(nw))) {
      hits += 1;
    }
  }
  const ratio = hits / qWords.length;
  if (ratio >= 1) return 75;
  if (ratio >= 0.6) return 55;
  return hits > 0 ? 30 : 0;
}

function matchAccount(query: string, accounts: CoaAccount[]): CoaAccount {
  const q = String(query || "").trim();
  const byCode = accounts.find(
    (a) => a.code === q || a.code.replace(/^0+/, "") === q.replace(/^0+/, "")
  );
  if (byCode) return byCode;
  const scored = accounts
    .map((a) => ({
      a,
      score: Math.max(scoreText(q, a.name), scoreText(q, `${a.code} ${a.name}`)),
    }))
    .filter((x) => x.score >= 30)
    .sort((x, y) => y.score - x.score);
  if (!scored.length) {
    throw new Error(`No account matching “${q}”`);
  }
  const top = scored[0];
  const second = scored[1];
  if (second && second.score >= top.score - 10 && second.score >= 55) {
    throw new Error(
      `Several accounts match “${q}” — try ${top.a.name} or ${second.a.name}`
    );
  }
  return top.a;
}

function parseTax(value: string): boolean {
  const t = String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /^(no|none|off|false|gst free|tax free|without gst|no gst|no tax|zero)$/.test(
      t
    )
  ) {
    return false;
  }
  if (
    /^(yes|on|true|gst|tax|with gst|plus gst|including gst|incl gst)$/.test(t)
  ) {
    return true;
  }
  throw new Error('Say “GST” or “no GST”');
}

function titleCaseWords(s: string): string {
  return titleCaseSubject(s);
}

function targetLine(
  lines: InvoiceLine[],
  lineIndex?: number
): InvoiceLine {
  if (!lines.length) throw new Error("Invoice has no line items");
  if (lineIndex != null) {
    const line = lines[lineIndex - 1];
    if (!line) throw new Error(`No line ${lineIndex}`);
    return line;
  }
  return lines[lines.length - 1];
}

export function fieldPrompt(field: InvoiceVoiceField): string {
  switch (field) {
    case "issueDate":
      return "Say the issue date…";
    case "orderDate":
      return "Say the order date…";
    case "dueDate":
      return "Say the due date…";
    case "subject":
      return "Say the subject…";
    case "matchKeyword":
      return "Say the bank match keyword…";
    case "notes":
      return "Say the notes…";
    case "description":
      return "Say the description…";
    case "quantity":
      return "Say the quantity…";
    case "unitPrice":
      return "Say the unit price…";
    case "account":
      return "Say the account…";
    case "tax":
      return "Say GST or no GST…";
  }
}

export async function applyInvoiceVoiceField(input: {
  invoice: Invoice;
  field: InvoiceVoiceField;
  value: string;
  lineIndex?: number;
  createLine?: boolean;
  asOfDate?: string;
}): Promise<{ invoice: Invoice; label: string; href?: string }> {
  const { invoice, field, value, lineIndex, createLine, asOfDate } = input;
  const spoken = String(value || "").trim();
  if (!spoken) throw new Error("Nothing heard to save");

  if (invoice.status === "void") {
    throw new Error("Cannot edit a void invoice");
  }

  const goEdit = `/invoices/${invoice.id}/edit`;
  const goView = `/invoices/${invoice.id}`;

  if (field === "issueDate" || field === "orderDate" || field === "dueDate") {
    const iso = parseSpokenDate(spoken, asOfDate);
    if (!iso) {
      throw new Error(
        `Could not hear a date in “${spoken}”. Try “13 August” or “today”.`
      );
    }
    const updated = await upsertInvoice({
      id: invoice.id,
      [field]: iso,
    });
    const label =
      field === "issueDate"
        ? `Issue date → ${iso}`
        : field === "orderDate"
          ? `Order date → ${iso}`
          : `Due date → ${iso}`;
    return { invoice: updated, label, href: goView };
  }

  if (field === "subject") {
    const updated = await upsertInvoice({
      id: invoice.id,
      subject: titleCaseWords(spoken),
    });
    return {
      invoice: updated,
      label: `Subject → ${updated.subject || spoken}`,
      href: goView,
    };
  }

  if (field === "matchKeyword") {
    const updated = await upsertInvoice({
      id: invoice.id,
      matchKeyword: titleCaseWords(spoken),
    });
    return {
      invoice: updated,
      label: `Bank match keyword → ${updated.matchKeyword}`,
      href: goView,
    };
  }

  if (field === "notes") {
    const updated = await upsertInvoice({
      id: invoice.id,
      notes: spoken,
    });
    return {
      invoice: updated,
      label: "Notes saved",
      href: goView,
    };
  }

  const coa = await readCoa();
  const revenue = coa.filter((a) => a.type === "Revenue");
  const defaultCode = revenue[0]?.code || invoice.lines[0]?.accountCode || "0105";

  let lines = invoice.lines.map((l) => ({ ...l }));
  let line: InvoiceLine;

  if (createLine) {
    if (field !== "description") {
      throw new Error("Say the description for the new line");
    }
    line = {
      id: `line-${Date.now()}`,
      description: titleCaseWords(spoken),
      quantity: 1,
      unitPrice: 0,
      accountCode: defaultCode,
      accountName: "",
      hasGST: true,
    };
    lines = [...lines, line];
  } else {
    line = { ...targetLine(lines, lineIndex) };
    if (field === "description") {
      line.description = titleCaseWords(spoken);
    } else if (field === "quantity") {
      const n = parseSpokenAmount(spoken);
      if (n == null) throw new Error(`Could not hear a quantity in “${spoken}”`);
      line.quantity = n;
    } else if (field === "unitPrice") {
      const n = parseSpokenAmount(spoken);
      if (n == null) {
        throw new Error(`Could not hear a unit price in “${spoken}”`);
      }
      line.unitPrice = n;
    } else if (field === "account") {
      const acc = matchAccount(spoken, revenue.length ? revenue : coa);
      line.accountCode = acc.code;
      line.accountName = acc.name;
      if (acc.noGST) line.hasGST = false;
    } else if (field === "tax") {
      line.hasGST = parseTax(spoken);
    }
    lines = lines.map((l) => (l.id === line.id ? line : l));
  }

  const updated = await upsertInvoice({
    id: invoice.id,
    lines,
  });
  const label = createLine
    ? `Added line “${line.description}”`
    : field === "description"
      ? `Description → ${line.description}`
      : field === "quantity"
        ? `Quantity → ${line.quantity}`
        : field === "unitPrice"
          ? `Unit → ${line.unitPrice}`
          : field === "account"
            ? `Account → ${line.accountCode} ${line.accountName}`.trim()
            : `Tax → ${line.hasGST ? "GST" : "no GST"}`;
  return { invoice: updated, label, href: goEdit };
}
