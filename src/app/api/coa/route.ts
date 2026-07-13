import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const coaPath = path.join(process.cwd(), 'data', 'coa.json');

export async function GET() {
  try {
    if (!fs.existsSync(coaPath)) {
      return NextResponse.json([]);
    }
    const data = fs.readFileSync(coaPath, 'utf8');
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    fs.writeFileSync(coaPath, JSON.stringify(body, null, 2));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
