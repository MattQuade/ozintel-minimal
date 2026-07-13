import { ledgerEngine } from '../../../core/ledger/ledgerEngine';

export async function GET() {
  try {
    const summary = ledgerEngine.getSummary();
    return Response.json(summary);
  } catch (error) {
    console.error('Summary API Error:', error);
    return Response.json({ 
      totalRevenue: 0, 
      totalExpenses: 0, 
      netProfit: 0,
      totalEntries: 0 
    });
  }
}