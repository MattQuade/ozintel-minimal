import { NextRequest, NextResponse } from "next/server";
import {
  publicUser,
  readUsers,
  writeUsers,
  type User,
  type UserPermissions,
  type UserStatus,
} from "@/lib/users";
import { ensureOwnerAccountingSilo } from "@/lib/accounting/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const users = await readUsers();
  return NextResponse.json({
    success: true,
    users: users.map(publicUser),
    persistentDisk: Boolean(process.env.OZINTEL_DATA_DIR?.trim()),
  });
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim() || "No phone yet";
    if (!name || !email) {
      return NextResponse.json(
        { success: false, error: "Name and email are required" },
        { status: 400 }
      );
    }
    const users = await readUsers();
    const existing = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (existing) {
      return NextResponse.json(
        { success: false, error: "User already exists" },
        { status: 409 }
      );
    }
    const user: User = {
      name,
      email,
      phone,
      status: "pending",
      smsCount: 0,
      smsMonth: new Date().toISOString().slice(0, 7),
      permissions: {
        accounting: false,
        pubOps: false,
        forestryOps: false,
      },
      shares: { pubOps: [] },
      lastAlert: null,
    };
    users.push(user);
    await writeUsers(users);
    return NextResponse.json({
      success: true,
      user: publicUser(user),
      users: users.map(publicUser),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to create user" },
      { status: 500 }
    );
  }
}
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim();
    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }
    const users = await readUsers();
    const idx = users.findIndex(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (idx < 0) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }
    if (body.status) {
      users[idx].status = body.status as UserStatus;
    }
    if (body.permissions && typeof body.permissions === "object") {
      users[idx].permissions = {
        ...users[idx].permissions,
        ...(body.permissions as Partial<UserPermissions>),
      };
      if (users[idx].permissions.accounting) {
        await ensureOwnerAccountingSilo(users[idx].email);
      }
    }
    if (body.shares && typeof body.shares === "object") {
      const incoming = body.shares as { pubOps?: unknown };
      const pubOps = Array.isArray(incoming.pubOps)
        ? incoming.pubOps
            .map((e) => String(e || "").trim().toLowerCase())
            .filter(Boolean)
        : users[idx].shares?.pubOps || [];
      const nextShares = [...new Set(pubOps)].filter(
        (e) => e !== users[idx].email.toLowerCase()
      );
      users[idx].shares = { pubOps: nextShares };

      // Ensure grantees can pass the Pub Ops gate to open this owner's silo.
      for (const granteeEmail of nextShares) {
        const gIdx = users.findIndex(
          (u) => u.email.toLowerCase() === granteeEmail
        );
        if (gIdx >= 0) {
          users[gIdx].permissions = {
            ...users[gIdx].permissions,
            pubOps: true,
          };
        }
      }
    }
    if (typeof body.name === "string") users[idx].name = body.name.trim();
    if (typeof body.phone === "string") users[idx].phone = body.phone.trim();
    await writeUsers(users);
    return NextResponse.json({
      success: true,
      user: publicUser(users[idx]),
      users: users.map(publicUser),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to update user" },
      { status: 500 }
    );
  }
}
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let email = searchParams.get("email") || "";
    if (!email) {
      try {
        const body = await req.json();
        email = String(body.email || "");
      } catch {
        // no body
      }
    }
    email = email.trim();
    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }
    const users = await readUsers();
    const next = users.filter(
      (u) => u.email.toLowerCase() !== email.toLowerCase()
    );
    if (next.length === users.length) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }
    await writeUsers(next);
    return NextResponse.json({
      success: true,
      users: next.map(publicUser),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
