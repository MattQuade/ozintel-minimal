import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import {
  publicUser,
  readUsers,
  readUsersFast,
  writeUsers,
  type User,
  type UserPermissions,
  type UserStatus,
} from "@/lib/users";
import { ensureOwnerAccountingSilo } from "@/lib/accounting/store";
import { getOwnerDataRoot } from "@/lib/dataPaths";
import { runWithDataOwnerAsync } from "@/lib/dataOwnerContext";
import { renameBottleShopLogin } from "@/lib/operations/pub/bottleshop";
import { getBottleShopOwnerEmail } from "@/lib/sms/sendSms";
import { renamePushIdentity } from "@/lib/push/subscriptions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
export async function GET() {
  // Hot path: never bootstrap/migrate on every phone/admin poll.
  const users = await readUsersFast();
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
        logisticsOps: false,
        bottleShop: false,
      },
      shares: { pubOps: [], logisticsOps: [] },
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
      const incoming = body.shares as {
        pubOps?: unknown;
        logisticsOps?: unknown;
      };
      const existing = {
        pubOps: users[idx].shares?.pubOps || [],
        logisticsOps: users[idx].shares?.logisticsOps || [],
      };
      const clean = (raw: unknown, fallback: string[]) =>
        Array.isArray(raw)
          ? raw
              .map((e) => String(e || "").trim().toLowerCase())
              .filter(Boolean)
          : fallback;
      const pubOps = [...new Set(clean(incoming.pubOps, existing.pubOps))].filter(
        (e) => e !== users[idx].email.toLowerCase()
      );
      const logisticsOps = [
        ...new Set(clean(incoming.logisticsOps, existing.logisticsOps)),
      ].filter((e) => e !== users[idx].email.toLowerCase());
      users[idx].shares = { pubOps, logisticsOps };

      for (const granteeEmail of pubOps) {
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
      for (const granteeEmail of logisticsOps) {
        const gIdx = users.findIndex(
          (u) => u.email.toLowerCase() === granteeEmail
        );
        if (gIdx >= 0) {
          users[gIdx].permissions = {
            ...users[gIdx].permissions,
            logisticsOps: true,
          };
        }
      }
    }
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json(
          { success: false, error: "Name is required" },
          { status: 400 }
        );
      }
      users[idx].name = name;
    }
    if (typeof body.phone === "string") users[idx].phone = body.phone.trim();

    const previousEmail = users[idx].email;
    const nextEmail =
      typeof body.newEmail === "string"
        ? body.newEmail.trim().toLowerCase().replace(/\s+/g, "")
        : previousEmail;
    if (nextEmail !== previousEmail.toLowerCase()) {
      if (!nextEmail.includes("@") || /[\\/]/.test(nextEmail)) {
        return NextResponse.json(
          { success: false, error: "Enter a username like summer@ozintel.com.au" },
          { status: 400 }
        );
      }
      const taken = users.some(
        (user, userIndex) =>
          userIndex !== idx && user.email.toLowerCase() === nextEmail
      );
      if (taken) {
        return NextResponse.json(
          { success: false, error: "That username is already in use" },
          { status: 409 }
        );
      }
      const fromDir = getOwnerDataRoot(previousEmail);
      const toDir = getOwnerDataRoot(nextEmail);
      const destExists = await pathExists(toDir);
      if (destExists) {
        return NextResponse.json(
          { success: false, error: "That username already has saved data" },
          { status: 409 }
        );
      }
      const replaceEmail = (value: string) =>
        value.toLowerCase() === previousEmail.toLowerCase() ? nextEmail : value;
      for (const user of users) {
        if (!user.shares) continue;
        user.shares = {
          pubOps: (user.shares.pubOps || []).map(replaceEmail),
          logisticsOps: (user.shares.logisticsOps || []).map(replaceEmail),
        };
      }
      users[idx].email = nextEmail;
      if (await pathExists(fromDir)) {
        await fs.rename(fromDir, toDir);
      }
      try {
        await renamePushIdentity(previousEmail, nextEmail);
        await runWithDataOwnerAsync(getBottleShopOwnerEmail(), () =>
          renameBottleShopLogin(previousEmail, nextEmail)
        );
      } catch (error) {
        console.error("[rename user links]", error);
      }
    }
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
