import { NextResponse } from 'next/server';

declare global {
  var ozintelUsers: any[] | undefined;
}

const users = global.ozintelUsers || (global.ozintelUsers = []);

export async function GET() {
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

    // Check if user already exists
    const existingIndex = users.findIndex(
      (u) => u.email.toLowerCase() === email.toLowerCase()
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

    const index = users.findIndex(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );

    if (index === -1) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    if (status) users[index].status = status;
    if (permissions) users[index].permissions = permissions;

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

    const index = users.findIndex(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );

    if (index === -1) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    users.splice(index, 1);

    return NextResponse.json({ success: true, users });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
