import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
const ledgerPath = path.join(dataDir, 'ledger.json');

export async function POST() {
  try {
    if (fs.existsSync(ledgerPath)) {
      fs.writeFileSync(ledgerPath, JSON.stringify([], null, 2));
    }
    return NextResponse.json({ success: true, message: "Ledger cleared" });
  } catch (err) {
    return NextResponse.json({ error: "Failed to reset" }, { status: 500 });
  }
}