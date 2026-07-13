import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
const ledgerPath = path.join(dataDir, 'ledger.json');

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const entries = Array.isArray(body.entries) ? body.entries : body;

    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: 'No entries received' }, { status: 400 });
    }

    // Ensure data folder exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Load existing ledger
    let ledger = [];
    if (fs.existsSync(ledgerPath)) {
      const raw = fs.readFileSync(ledgerPath, 'utf8');
      ledger = JSON.parse(raw);
    }

    // Add new entries
    const newEntries = entries.map((e: any) => ({
      ...e,
      timestamp: new Date().toISOString()
    }));

    ledger = [...ledger, ...newEntries];

    // Save
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

    console.log(`💾 Saved ${newEntries.length} transactions. Total now: ${ledger.length}`);

    return NextResponse.json({ 
      success: true, 
      saved: newEntries.length,
      total: ledger.length 
    });
  } catch (err: any) {
    console.error('Save Error:', err);
    return NextResponse.json({ 
      error: err.message || 'Failed to save to ledger' 
    }, { status: 500 });
  }
}