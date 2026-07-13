export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype?: string;
  taxCode?: string;
  isActive: boolean;
}

export interface JournalLine {
  id: string;
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
  taxCode?: string;
  taxAmount?: number;
}

export interface Journal {
  id: string;
  date: string;
  reference: string;
  description: string;
  source: 'manual' | 'bank-import' | 'sales' | 'purchase';
  lines: JournalLine[];
  createdAt: string;
  createdBy?: string;
}

export interface LedgerSummary {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  asAt: string;
}