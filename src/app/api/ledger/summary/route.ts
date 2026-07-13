import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ledgerPath = path.join(process.cwd(), 'data', 'ledger.json');

export async function GET() {
  try {
    let entries: any[] = [];

    if (fs.existsSync(ledgerPath)) {
      const data = fs.readFileSync(ledgerPath, 'utf8');
      entries = JSON.parse(data || '[]');
    }

    const revenue = entries
      .filter((e: any) => e.type === 'Revenue')
      .reduce((sum: number, e: any) => sum + Math.abs(e.amount), 0);

    const expenses = entries
      .filter((e: any) => e.type === 'Expense')
      .reduce((sum: number, e: any) => sum + Math.abs(e.amount), 0);

    const netProfit = revenue - expenses;

    return NextResponse.json({
      totalRevenue: revenue,
      totalExpenses: expenses,
      netProfit: netProfit,
      totalTransactions: entries.length,
    });
  } catch (error) {
    console.error('Ledger Summary Error:', error);
    return NextResponse.json({
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      totalTransactions: 0,
    });
  }
}