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
    name: "White Tank Hotel other income",
    matchValue: "WHITE TANK",
    matchField: "description",
    matchType: "contains",
    accountCode: OTHER_INCOME_CODE,
    accountName: OTHER_INCOME_NAME,
    type: "Revenue",
    noGST: false,
    direction: "receive",
  },
  {
    id: 9106,
    name: "Railway Hotel Lockhart other income",
    matchValue: "RAILWAY HOTEL",
    matchValues: ["RAILWAY HOTEL LOCKHART", "RAILWAY HOTEL – LOCKHART"],
    matchField: "description",
    matchType: "contains",
    accountCode: OTHER_INCOME_CODE,
    accountName: OTHER_INCOME_NAME,
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

function isCardRepayment(rule: RuleLike): boolean {
  const blob = [rule.matchValue, ...(rule.matchValues || [])]
    .join(" ")
    .toUpperCase();
  return blob.includes("CC RPYMNT") || blob.includes("CC PYMNTS");
}

export function withJournalRuleFixes<T extends RuleLike>(
  rules: T[]
): { rules: T[]; changed: boolean } {
  let changed = false;
  const patched = rules.map((rule) => {
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
