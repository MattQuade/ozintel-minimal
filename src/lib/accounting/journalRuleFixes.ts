/**
 * Corrections that must win over short Xero keywords (MOBIL, ATO, BAS, suspense).
 * Applied when bank rules are read so each owner's silo picks them up.
 */

export type RuleLike = {
  id: number;
  name: string;
  matchValue: string;
  matchValues?: string[];
  matchField?: string;
  matchType?: string;
  descriptionOverride?: string;
  bankAccountId?: string;
  direction?: string;
  accountCode: string;
  accountName: string;
  type: string;
  autoReconcile?: boolean;
  noGST?: boolean;
};

export const BANK_TRANSFER_CODE = "2480";
export const BANK_TRANSFER_NAME = "Bank Transfer";
export const OTHER_INCOME_CODE = "0500";
export const OTHER_INCOME_NAME = "Other Income";
export const DRAUGHT_WHOLESALE_NAME = "Draught Wholesale";
export const PERSONAL_LOAN_CODE = "3565/04";
export const PERSONAL_LOAN_NAME = "Matt Quade – Personal Loan";
export const SOFTWARE_CODE = "1577";
export const SOFTWARE_NAME = "Computer Software & Support";

const BANK_TRANSFER = {
  accountCode: BANK_TRANSFER_CODE,
  accountName: BANK_TRANSFER_NAME,
  type: "Asset",
  noGST: true,
};

/** Prepended so they match before broader fuel / ATO rules. */
export const JOURNAL_PRIORITY_RULES: RuleLike[] = [
  {
    id: 9101,
    name: "Credit card repayment transfer",
    matchValue: "CC RPYMNT",
    matchValues: ["CC Rpymnt", "CC PYMNTS", "CC RPYMNT 2"],
    matchField: "description",
    matchType: "contains",
    accountCode: BANK_TRANSFER_CODE,
    accountName: BANK_TRANSFER_NAME,
    type: "Asset",
    noGST: true,
    direction: "any",
  },
  {
    id: 9102,
    name: "Transfer to Matt Quade personal account",
    matchValue: "MATT AURELIE QUADE",
    matchValues: ["MATTHEW AURELIE QUADE", "TO MATT AURELIE QUADE"],
    matchField: "description",
    matchType: "contains",
    accountCode: BANK_TRANSFER_CODE,
    accountName: BANK_TRANSFER_NAME,
    type: "Asset",
    noGST: true,
    direction: "spend",
  },
  {
    id: 9103,
    name: "Dr Tim Caton personal loan",
    matchValue: "TIM CATON",
    matchValues: ["DR TIM CATON"],
    matchField: "description",
    matchType: "contains",
    accountCode: PERSONAL_LOAN_CODE,
    accountName: PERSONAL_LOAN_NAME,
    type: "Liability",
    noGST: true,
    direction: "receive",
  },
  {
    id: 9104,
    name: "Hammond Cristofaro other income",
    matchValue: "CRISTOFARO",
    matchValues: ["CRISTOFAROCOREY", "HAMMOND CRISTOFARO"],
    matchField: "description",
    matchType: "contains",
    accountCode: OTHER_INCOME_CODE,
    accountName: OTHER_INCOME_NAME,
    type: "Revenue",
    noGST: false,
    direction: "receive",
  },
  {
    id: 9105,
    name: "White Tank Hotel draught wholesale",
    matchValue: "WHITE TANK",
    matchValues: ["WHITE TANK HOTEL"],
    matchField: "description",
    matchType: "contains",
    accountCode: OTHER_INCOME_CODE,
    accountName: DRAUGHT_WHOLESALE_NAME,
    type: "Revenue",
    noGST: false,
    direction: "receive",
  },
  {
    id: 9106,
    name: "Railway Hotel Lockhart draught wholesale",
    matchValue: "RAILWAY HOTEL",
    matchValues: ["RAILWAY HOTEL LOCKHART", "RAILWAY HOTEL – LOCKHART", "LOCKHART"],
    matchField: "description",
    matchType: "contains",
    accountCode: OTHER_INCOME_CODE,
    accountName: DRAUGHT_WHOLESALE_NAME,
    type: "Revenue",
    noGST: false,
    direction: "receive",
  },
  {
    id: 9108,
    name: "Katarina Namana Tallimba Inn draught wholesale",
    matchValue: "KATARINA NAMANA",
    matchValues: ["KATARINA"],
    matchField: "description",
    matchType: "contains",
    accountCode: OTHER_INCOME_CODE,
    accountName: DRAUGHT_WHOLESALE_NAME,
    type: "Revenue",
    noGST: false,
    direction: "receive",
  },
  {
    id: 9109,
    name: "Mangoplah Hotel draught wholesale",
    matchValue: "MANGOPLAH",
    matchValues: ["MANGOPLAH HOTEL"],
    matchField: "description",
    matchType: "contains",
    accountCode: OTHER_INCOME_CODE,
    accountName: DRAUGHT_WHOLESALE_NAME,
    type: "Revenue",
    noGST: false,
    direction: "receive",
  },
  {
    id: 9110,
    name: "Tallimba draught wholesale",
    matchValue: "TALLIMBA",
    matchValues: ["TALLIMBA HOTEL"],
    matchField: "description",
    matchType: "contains",
    accountCode: OTHER_INCOME_CODE,
    accountName: DRAUGHT_WHOLESALE_NAME,
    type: "Revenue",
    noGST: false,
    direction: "receive",
  },
  {
    id: 9111,
    name: "Grong Grong draught wholesale",
    matchValue: "GRONG",
    matchValues: ["GRONG GRONG", "ROYAL HOTEL GRONG"],
    matchField: "description",
    matchType: "contains",
    accountCode: OTHER_INCOME_CODE,
    accountName: DRAUGHT_WHOLESALE_NAME,
    type: "Revenue",
    noGST: false,
    direction: "receive",
  },
  {
    id: 9107,
    name: "Base44 software",
    matchValue: "BASE44",
    matchField: "description",
    matchType: "contains",
    accountCode: SOFTWARE_CODE,
    accountName: SOFTWARE_NAME,
    type: "Expense",
    noGST: false,
    direction: "spend",
  },
];

function isKatarinaIncome(rule: RuleLike): boolean {
  const blob = [rule.name, rule.matchValue, ...(rule.matchValues || [])]
    .join(" ")
    .toUpperCase();
  return blob.includes("KATARINA");
}

function isCardRepayment(rule: RuleLike): boolean {
  const blob = [rule.matchValue, ...(rule.matchValues || [])]
    .join(" ")
    .toUpperCase();
  return blob.includes("CC RPYMNT") || blob.includes("CC PYMNTS");
}

function listKey(values?: string[]): string {
  return (values || []).join("\n");
}

function samePriorityRule(rule: RuleLike, want: RuleLike): boolean {
  return (
    rule.name === want.name &&
    rule.matchValue === want.matchValue &&
    listKey(rule.matchValues) === listKey(want.matchValues) &&
    (rule.matchField || "description") === (want.matchField || "description") &&
    (rule.matchType || "contains") === (want.matchType || "contains") &&
    (rule.direction || "any") === (want.direction || "any") &&
    rule.accountCode === want.accountCode &&
    rule.accountName === want.accountName &&
    rule.type === want.type &&
    Boolean(rule.noGST) === Boolean(want.noGST) &&
    !rule.bankAccountId
  );
}

export function withJournalRuleFixes<T extends RuleLike>(
  rules: T[]
): { rules: T[]; changed: boolean } {
  let changed = false;
  const canonical = new Map(JOURNAL_PRIORITY_RULES.map((rule) => [rule.id, rule]));
  const patched = rules.map((rule) => {
    const want = canonical.get(rule.id);
    if (want) {
      if (samePriorityRule(rule, want)) return rule;
      changed = true;
      const next = { ...rule, ...want } as T;
      delete (next as { bankAccountId?: string }).bankAccountId;
      return next;
    }
    if (isKatarinaIncome(rule) && rule.accountName !== DRAUGHT_WHOLESALE_NAME) {
      changed = true;
      return {
        ...rule,
        accountCode: OTHER_INCOME_CODE,
        accountName: DRAUGHT_WHOLESALE_NAME,
        type: "Revenue",
        noGST: false,
      };
    }
    if (!isCardRepayment(rule)) return rule;
    if (
      rule.accountCode === BANK_TRANSFER_CODE &&
      rule.accountName === BANK_TRANSFER_NAME &&
      rule.type === "Asset" &&
      rule.noGST === true
    ) {
      return rule;
    }
    changed = true;
    return { ...rule, ...BANK_TRANSFER };
  });

  const have = new Set(patched.map((rule) => rule.id));
  const missing = JOURNAL_PRIORITY_RULES.filter((rule) => !have.has(rule.id));
  if (missing.length > 0) changed = true;
  return {
    rules: [...(missing as T[]), ...patched],
    changed,
  };
}
