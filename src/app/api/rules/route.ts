import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const rulesPath = path.join(process.cwd(), 'src', 'core', 'rules', 'rules.json');

export async function GET() {
  try {
    const data = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    return NextResponse.json(data.rules || []);
  } catch (error) {
    console.error(error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const newRules = await request.json();
    const fullData = { rules: newRules };
    
    fs.writeFileSync(rulesPath, JSON.stringify(fullData, null, 2));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}