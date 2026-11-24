import { NextRequest, NextResponse } from "next/server";
import { createSignDoc, listSignDocs } from "@/lib/signDocs";
import { readUsersFast } from "@/lib/users";
import { sessionEmail } from "@/app/api/sign-docs/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const email = sessionEmail(req);
  if (!email) {
    return NextResponse.json(
      { success: false, error: "Restore your account on the OzIntel home page first." },
      { status: 401, headers: noStore }
    );
  }
  const [docs, users] = await Promise.all([listSignDocs(email), readUsersFast()]);
  const me = users.find((user) => user.email.trim().toLowerCase() === email);
  if (!me || me.status !== "approved") {
    return NextResponse.json(
      { success: false, error: "Your login is not approved yet." },
      { status: 403, headers: noStore }
    );
  }
  const people = users
    .filter((user) => user.status === "approved" && user.email.trim().toLowerCase() !== email)
    .map((user) => ({ email: user.email, name: user.name || user.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json(
    {
      success: true,
      me: { email, name: me?.name || email },
      people,
      documents: docs,
    },
    { headers: noStore }
  );
}

export async function POST(req: NextRequest) {
  const email = sessionEmail(req);
  if (!email) {
    return NextResponse.json(
      { success: false, error: "Restore your account on the OzIntel home page first." },
      { status: 401, headers: noStore }
    );
  }
  try {
    const users = await readUsersFast();
    const me = users.find((user) => user.email.trim().toLowerCase() === email && user.status === "approved");
    if (!me) {
      return NextResponse.json(
        { success: false, error: "Your login is not approved yet." },
        { status: 403, headers: noStore }
      );
    }
    const type = req.headers.get("content-type") || "";
    let title = "";
    let body = "";
    let signerEmail = "";
    let pdf: Buffer | undefined;
    if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      title = String(form.get("title") || "");
      body = String(form.get("body") || "");
      signerEmail = String(form.get("signerEmail") || "");
      const file = form.get("file");
      if (file instanceof File && file.size) {
        if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
          return NextResponse.json(
            { success: false, error: "Upload the PDF saved from Word." },
            { status: 400, headers: noStore }
          );
        }
        pdf = Buffer.from(await file.arrayBuffer());
      }
    } else {
      const json = await req.json().catch(() => ({}));
      title = String(json.title || "");
      body = String(json.body || "");
      signerEmail = String(json.signerEmail || "");
    }
    const signer = users.find(
      (user) =>
        user.status === "approved" &&
        user.email.trim().toLowerCase() === signerEmail.trim().toLowerCase()
    );
    if (!signer) {
      return NextResponse.json(
        { success: false, error: "Choose an approved OzIntel user to sign." },
        { status: 400, headers: noStore }
      );
    }
    const doc = await createSignDoc({
      title,
      body,
      pdf,
      owner: { email: me.email, name: me.name },
      signer: { email: signer.email, name: signer.name },
    });
    return NextResponse.json({ success: true, document: doc }, { headers: noStore });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not save the document." },
      { status: 400, headers: noStore }
    );
  }
}
