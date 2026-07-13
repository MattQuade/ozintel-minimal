// src/core/journals/journalTypes.ts

export interface JournalLine {
  account: string;
  debit?: number;
  credit?: number;
  gstType?: "collected" | "paid" | "none";
}

export interface Journal {
  id: string;
  date: string;
  type: string;
  description: string;
  autoReverse: boolean;
  lines: JournalLine[];
}