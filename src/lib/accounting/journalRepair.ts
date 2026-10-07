/**
 * Account fixes for bank lines, then balanced journals from 1 July 2026.
 * Invoice journals in that year are kept so a customer can pay in instalments.
 * GST on a bank purchase or deposit is its own line once the journal is balanced.
 */

import { DOUBLE_ENTRY_FROM, isJournalLeg } from "@/lib/accounting/doubleEntry";
import { toIsoDateInput } from "@/lib/accounting/dates";
import { round2 } from "@/lib/accounting/invoiceMath";
import {
  BANK_TRANSFER_CODE,
  BANK_TRANSFER_NAME,
  DRAUGHT_WHOLESALE_NAME,
  OTHER_INCOME_CODE,
  OTHER_INCOME_NAME,
  PERSONAL_LOAN_CODE,
  PERSONAL_LOAN_NAME,
  SOFTWARE_CODE,
  SOFTWARE_NAME,
} from "@/lib/accounting/journalRuleFixes";

export type RepairEntry = {
  id: string;
  date?: string;
  description?: string;
  amount?: number;
  type?: string;
  account?: string;
  accountCode?: string;
  accountName?: string;
  source?: string;
  journalRef?: string;
  noGST?: boolean;
  hasGST?: boolean;
  gstAmount?: number;
  taxCode?: string;
  gstExclusive?: boolean;
  amountIncludesGst?: boolean;
  [key: string]: unknown;
};

type AccountFix = {
  accountCode: string;
  accountName: string;
  type: string;
  noGST: boolean;
};

function textOf(entry: RepairEntry): string {
  return String(entry.description || "").toLowerCase();
}

function gstOnInclusive(amount: number): number {
  const abs = Math.abs(Number(amount) || 0);
  if (abs < 0.005) return 0;
  return round2(abs - abs / 1.1);
}

function applyAccount(entry: RepairEntry, fix: AccountFix): RepairEntry {
  const next: RepairEntry = {
    ...entry,
    accountCode: fix.accountCode,
    accountName: fix.accountName,
    account: `${fix.accountCode} - ${fix.accountName}`,
    type: fix.type,
    noGST: fix.noGST,
    hasGST: !fix.noGST,
    taxCode: fix.noGST ? "N-T" : "GST",
    gstExclusive: false,
    amountIncludesGst: !fix.noGST,
    gstAmount: fix.noGST ? 0 : gstOnInclusive(Number(entry.amount) || 0),
  };
  return next;
}

function sameAccount(entry: RepairEntry, fix: AccountFix): boolean {
  return (
    String(entry.accountCode || "") === fix.accountCode &&
    String(entry.accountName || "") === fix.accountName &&
    String(entry.type || "") === fix.type &&
    Boolean(entry.noGST) === fix.noGST
  );
}

/** Description → account. Null when the line should be left alone. */
export function accountFixForDescription(
  description: string,
  currentCode?: string
): AccountFix | null {
  const text = description.toLowerCase();
  if (!text.trim()) return null;

  if (/cc rpymnt|cc pymnts/.test(text)) {
    return {
      accountCode: BANK_TRANSFER_CODE,
      accountName: BANK_TRANSFER_NAME,
      type: "Asset",
      noGST: true,
    };
  }
  if (/matt aurelie quade|matthew aurelie quade/.test(text)) {
    return {
      accountCode: BANK_TRANSFER_CODE,
      accountName: BANK_TRANSFER_NAME,
      type: "Asset",
      noGST: true,
    };
  }
  if (/tim caton/.test(text)) {
    return {
      accountCode: PERSONAL_LOAN_CODE,
      accountName: PERSONAL_LOAN_NAME,
      type: "Liability",
      noGST: true,
    };
  }
  if (/cristofaro/.test(text)) {
    return {
      accountCode: OTHER_INCOME_CODE,
      accountName: OTHER_INCOME_NAME,
      type: "Revenue",
      noGST: false,
    };
  }
  if (isDraughtWholesale(description)) {
    return incomeAccount(description);
  }
  if (/base44/.test(text)) {
    return {
      accountCode: SOFTWARE_CODE,
      accountName: SOFTWARE_NAME,
      type: "Expense",
      noGST: false,
    };
  }
  // MOBIL inside MOBILE BANKING was coded as fuel. This payment is not fuel.
  if (
    /mobile banking/.test(text) &&
    /willis/.test(text) &&
    String(currentCode || "") === "1348"
  ) {
    return {
      accountCode: "9999",
      accountName: "Uncategorized",
      type: "Uncategorized",
      noGST: true,
    };
  }
  return null;
}

function isDraughtWholesale(description: string): boolean {
  const text = description.toLowerCase();
  if (/cristofaro|cafe|p and c|p&c/.test(text)) return false;
  return /katarina|mangoplah|tallimba|grong|white tank|railway hotel|lockhart/.test(
    text
  );
}

function incomeAccount(description: string): AccountFix {
  return {
    accountCode: OTHER_INCOME_CODE,
    accountName: isDraughtWholesale(description)
      ? DRAUGHT_WHOLESALE_NAME
      : OTHER_INCOME_NAME,
    type: "Revenue",
    noGST: false,
  };
}

function isOtherIncomeCustomer(description: string): boolean {
  const text = description.toLowerCase();
  return isDraughtWholesale(description) || /katarina|cristofaro/.test(text);
}

function absAmount(entry: RepairEntry): number {
  return round2(Math.abs(Number(entry.amount) || 0));
}

/**
 * One bank line per other-income deposit. Drop the invoice AR / GST / revenue
 * split and the payment pair when they sit beside that deposit.
 */
function collapseSameDaySplits<T extends RepairEntry>(entries: T[]): {
  entries: T[];
  changed: boolean;
} {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    if (isJournalLeg(entry)) continue;
    const source = String(entry.source || "");
    if (
      source === "invoice" ||
      source === "invoice-payment" ||
      source === "invoice-void" ||
      source === "payroll" ||
      source === "depreciation" ||
      source === "asset-disposal" ||
      source === "bank-journal"
    ) {
      continue;
    }
    const key = `${String(entry.date || "").slice(0, 10)}|${textOf(entry)}`;
    const list = groups.get(key) || [];
    list.push(entry);
    groups.set(key, list);
  }

  const drop = new Set<string>();
  const converted = new Map<string, T>();
  for (const group of groups.values()) {
    if (group.length < 3) continue;
    const text = textOf(group[0]);
    const otherIncome =
      isOtherIncomeCustomer(text) ||
      group.some((line) =>
        ["0500", "820", "2101"].includes(String(line.accountCode || ""))
      );
    if (!otherIncome) continue;
    const gross = Math.max(...group.map(absAmount));
    const pieces = group.filter((line) => absAmount(line) !== gross);
    const sum = round2(pieces.reduce((total, line) => total + absAmount(line), 0));
    if (Math.abs(sum - gross) > 0.02) continue;
    const keep = group.find((line) => absAmount(line) === gross);
    if (!keep) continue;
    converted.set(keep.id, applyAccount(keep, incomeAccount(text)) as T);
    group.forEach((line) => {
      if (line.id !== keep.id) drop.add(line.id);
    });
  }

  if (drop.size === 0 && converted.size === 0) {
    return { entries, changed: false };
  }
  return {
    changed: true,
    entries: entries
      .filter((entry) => !drop.has(entry.id))
      .map((entry) => converted.get(entry.id) || entry),
  };
}

export function repairJournalEntries<T extends RepairEntry>(entries: T[]): {
  entries: T[];
  changed: boolean;
} {
  const collapsed = collapseSameDaySplits(entries);
  let changed = collapsed.changed;
  const recoded = collapsed.entries.map((entry) => {
    const source = String(entry.source || "");
    if (source === "invoice" || source === "invoice-payment" || source === "invoice-void") {
      return entry;
    }
    if (isJournalLeg(entry)) return entry;
    const fix = accountFixForDescription(
      String(entry.description || ""),
      String(entry.accountCode || "")
    );
    if (!fix || sameAccount(entry, fix)) return entry;
    changed = true;
    return applyAccount(entry, fix) as T;
  });

  const drop = new Set<string>();
  const converted = new Map<string, T>();

  const groups = new Map<string, T[]>();
  for (const entry of recoded) {
    const source = String(entry.source || "");
    const ref = String(entry.journalRef || "");
    if (!ref) continue;
    if (source !== "invoice" && source !== "invoice-payment") continue;
    const key = `${source}|${ref}`;
    const list = groups.get(key) || [];
    list.push(entry);
    groups.set(key, list);
  }

  const bankLines = recoded.filter((entry) => {
    const source = String(entry.source || "");
    return source !== "invoice" && source !== "invoice-payment" && source !== "invoice-void";
  });

  function hasBankCover(amount: number, date: string, description: string): boolean {
    return bankLines.some((line) => {
      if (absAmount(line) !== amount) return false;
      const lineDate = String(line.date || "").slice(0, 10);
      const wantDate = String(date || "").slice(0, 10);
      if (wantDate && lineDate && lineDate !== wantDate) return false;
      const lineText = textOf(line);
      const want = description.toLowerCase();
      if (!want) return true;
      const token = want.split(/—|-/).pop()?.trim() || want;
      return !token || lineText.includes(token) || token.includes(lineText);
    });
  }

  for (const [key, group] of groups) {
    const source = key.slice(0, key.indexOf("|"));
    const sample = group[0];
    const desc = String(sample?.description || "");
    const sampleDay = toIsoDateInput(sample?.date);
    if (sampleDay && sampleDay >= DOUBLE_ENTRY_FROM) continue;
    const otherIncome =
      isOtherIncomeCustomer(desc) ||
      group.some((line) => String(line.accountCode || "") === OTHER_INCOME_CODE);

    if (source === "invoice-payment") {
      const positive = group.find((line) => (Number(line.amount) || 0) > 0);
      const amount = positive ? absAmount(positive) : 0;
      if (positive && hasBankCover(amount, String(positive.date || ""), desc)) {
        group.forEach((line) => drop.add(line.id));
        changed = true;
        continue;
      }
      if (positive && otherIncome) {
        converted.set(
          positive.id,
          applyAccount(
            { ...positive, source: "bank-import", description: desc },
            incomeAccount(desc)
          ) as T
        );
        group.forEach((line) => {
          if (line.id !== positive.id) drop.add(line.id);
        });
        changed = true;
      }
      continue;
    }

    if (source === "invoice" && otherIncome) {
      const positive = group.find(
        (line) =>
          String(line.accountCode || "") === "2101" ||
          (Number(line.amount) || 0) > 0
      );
      const amount = positive ? absAmount(positive) : 0;
      if (positive && hasBankCover(amount, String(positive.date || ""), desc)) {
        group.forEach((line) => drop.add(line.id));
        changed = true;
        continue;
      }
      if (positive) {
        converted.set(
          positive.id,
          applyAccount(
            {
              ...positive,
              source: "bank-import",
              description: desc.replace(/^Invoice\s+\S+\s+—\s+/i, "") || desc,
            },
            incomeAccount(desc)
          ) as T
        );
        group.forEach((line) => {
          if (line.id !== positive.id) drop.add(line.id);
        });
        changed = true;
      }
    }
  }

  if (!changed && converted.size === 0 && drop.size === 0) {
    return { entries, changed: false };
  }

  const next = recoded
    .filter((entry) => !drop.has(entry.id))
    .map((entry) => converted.get(entry.id) || entry);

  return { entries: next, changed: true };
}
