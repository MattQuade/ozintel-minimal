import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ledgerPath = path.join(process.cwd(), 'data', 'ledger.json');

export async function GET() {
  try {
    if (!fs.existsSync(ledgerPath)) {
      return NextResponse.json([]);
    }

    const raw = fs.readFileSync(ledgerPath, 'utf8');
    let entries = JSON.parse(raw || '[]');

    return NextResponse.json(entries);
  } catch (err) {
    console.error("Entries API Error:", err);
    return NextResponse.json([]);
  }
}