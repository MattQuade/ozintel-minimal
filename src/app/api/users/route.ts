import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'users.json');

// Ensure data folder and file exist
function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
}

function loadUsers(): any[] {
  ensureDataFile();
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load users:', err);
    return [];
  }
}

function saveUsers(users: any[]) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), 'utf8');
}

export async function GET() {
  const users = loadUsers();
  return NextResponse.json({ success: true, users });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, phone } = body;

    if (!name || !email || !phone) {
      return NextResponse.json(
        { success: false, error: 'Name, email and phone are required' },
        { status: 400 }
      );
    }

    const users = loadUsers();

    const existingIndex = users.findIndex(
      (u: any) => u.email.toLowerCase() === email.toLowerCase()
    );

    const newUser = {
      name,
      email,
      phone,
      status: 'pending',
      smsCount: 0,
      permissions: {
        accounting: false,
        pubOps: false,
        forestryOps: false,
      },
    };

    if (existingIndex >= 0) {
      users[existingIndex] = newUser;
    } else {
      users.push(newUser);
    }

    saveUsers(users);

    return NextResponse.json({ success: true, user: newUser, users });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create user' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { email, status, permissions } = body;

    const users = loadUsers();
    const index = users.findIndex(
      (u: any) => u.email.toLowerCase() === email.toLowerCase()
    );

    if (index === -1) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    if (status) users[index].status = status;
    if (permissions) users[index].permissions = permissions;

    saveUsers(users);

    return NextResponse.json({ success: true, users });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    const users = loadUsers();
    const index = users.findIndex(
      (u: any) => u.email.toLowerCase() === email.toLowerCase()
    );

    if (index === -1) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    users.splice(index, 1);
    saveUsers(users);

    return NextResponse.json({ success: true, users });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
