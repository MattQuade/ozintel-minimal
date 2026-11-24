"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

type Party = { email: string; name: string; signedAt?: string };
type SignDoc = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  uploaded: boolean;
  fileName?: string;
  owner: Party;
  signer: Party;
};
type Me = { email: string; name: string };

function when(iso?: string) {
  if (!iso) return "Not signed yet";
  try {
    return new Date(iso).toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "Signed";
  }
}

function docName(doc: SignDoc) {
  return doc.fileName || doc.title;
}

export default function SignDocumentPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [people, setPeople] = useState<Party[]>([]);
  const [docs, setDocs] = useState<SignDoc[]>([]);
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [openId, setOpenId] = useState("");
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  const load = useCallback(async (keepStatus = false) => {
    const res = await fetch("/api/sign-docs", { credentials: "include", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!data.success) {
      setMe(null);
      setStatus(data.error || "Restore your account on the OzIntel home page first.");
      return;
    }
    setMe(data.me);
    setPeople(Array.isArray(data.people) ? data.people : []);
    setDocs(Array.isArray(data.documents) ? data.documents : []);
    setSignerEmail((prev) => prev || data.people?.[0]?.email || "");
    if (!keepStatus) setStatus("");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const createDoc = async () => {
    if (!file && !title.trim()) {
      setStatus(body.trim() ? "Give the document a title." : "Choose the PDF.");
      return;
    }
    setBusy(true);
    setStatus("Saving the document…");
    try {
      const form = new FormData();
      form.set("title", file ? file.name.replace(/\.pdf$/i, "") : title.trim());
      form.set("body", file ? "" : body);
      form.set("signerEmail", signerEmail);
      if (file) {
        form.set("file", file);
        form.set("fileName", file.name);
      }
      const res = await fetch("/api/sign-docs", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        setStatus(data.error || "Could not save the document.");
        return;
      }
      setTitle("");
      setBody("");
      setFile(null);
      setOpenId(data.document.id);
      setStatus("Sign in the box under the document.");
      await load(true);
    } catch {
      setStatus("Could not save the document.");
    } finally {
      setBusy(false);
    }
  };

  const saveSignature = async () => {
    const canvas = canvasRef.current;
    const doc = docs.find((item) => item.id === openId);
    const png = canvas ? signaturePng(canvas) : "";
    if (!doc || !png) {
      setStatus("Draw your signature in the box first.");
      return;
    }
    setBusy(true);
    setStatus("Saving your signature…");
    try {
      const res = await fetch(`/api/sign-docs/${doc.id}/sign`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ png }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        setStatus(data.error || "Could not save the signature.");
        return;
      }
      const saved = data.document as SignDoc | undefined;
      const otherName = saved
        ? saved.owner.email.toLowerCase() === me?.email.toLowerCase()
          ? saved.signer.name
          : saved.owner.name
        : "The other person";
      const otherSigned = saved
        ? saved.owner.email.toLowerCase() === me?.email.toLowerCase()
          ? saved.signer.signedAt
          : saved.owner.signedAt
        : undefined;
      setStatus(
        otherSigned ? "Both signatures are on the document." : `Signed. ${otherName} can sign it from their OzIntel login.`
      );
      await load(true);
    } catch {
      setStatus("Could not save the signature. Draw it again and try once more.");
    } finally {
      setBusy(false);
    }
  };

  const removeDoc = async (id: string) => {
    if (!window.confirm("Delete this document? It will be removed for both people.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sign-docs/${id}`, { method: "DELETE", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        setStatus(data.error || "Could not delete the document.");
        return;
      }
      if (openId === id) setOpenId("");
      setStatus("Document deleted.");
      await load(true);
    } catch {
      setStatus("Could not delete the document.");
    } finally {
      setBusy(false);
    }
  };

  const open = docs.find((item) => item.id === openId) || null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== 600 || canvas.height !== 200) {
      canvas.width = 600;
      canvas.height = 200;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [open?.id]);

  const mine = me ? open?.owner.email.toLowerCase() === me.email.toLowerCase() : false;

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#f4f7fb",
        color: "#0c2f6b",
        minHeight: "100vh",
        padding: "calc(20px + env(safe-area-inset-top, 0px)) 16px calc(180px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <p style={{ margin: "0 0 12px" }}>
          <a href="/" style={{ color: "#075985" }}>
            ← OzIntel
          </a>
        </p>
        <h1 style={{ margin: "0 0 8px", fontSize: "1.8rem" }}>Sign a document</h1>
        <p style={{ margin: "0 0 20px", color: "#5b6b82", lineHeight: 1.45 }}>
          Upload the PDF and sign in the box. It stays in OzIntel. The other person signs it from their login.
        </p>

        {!me ? (
          <p>{status || "Restore your account on the home page, then open this again."}</p>
        ) : (
          <>
            <section
              style={{
                background: "white",
                border: "1px solid #d5deea",
                borderRadius: 12,
                padding: 14,
                marginBottom: 20,
              }}
            >
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>PDF</label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  const next = event.target.files?.[0] || null;
                  setFile(next);
                  if (next) setTitle("");
                }}
              />
              {file ? (
                <p style={{ margin: "8px 0 0", fontWeight: 700 }}>{file.name}</p>
              ) : (
                <>
                  <label style={{ display: "block", fontWeight: 700, margin: "12px 0 6px" }}>Or type it here</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={field} />
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={6}
                    placeholder="Document"
                    style={{ ...field, marginTop: 8, resize: "vertical" }}
                  />
                </>
              )}
              <label style={{ display: "block", fontWeight: 700, margin: "12px 0 6px" }}>Ask this person to sign</label>
              <select value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} style={field}>
                {people.map((person) => (
                  <option key={person.email} value={person.email}>
                    {person.name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={busy} onClick={() => void createDoc()} style={primary}>
                {busy ? "Working…" : "Save in OzIntel"}
              </button>
            </section>

            <section style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: "1.1rem", margin: "0 0 8px" }}>Your documents</h2>
              {docs.length ? (
                docs.map((doc) => (
                  <div key={doc.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                      <button type="button" onClick={() => setOpenId(doc.id === openId ? "" : doc.id)} style={rowButton}>
                        {docName(doc)}
                        <span style={{ display: "block", fontWeight: 500, color: "#5b6b82" }}>
                          {doc.owner.name} and {doc.signer.name}
                        </span>
                      </button>
                      <button type="button" onClick={() => void removeDoc(doc.id)} style={deleteButton}>
                        Delete
                      </button>
                    </div>
                    {open?.id === doc.id ? (
                      <section
                        style={{
                          background: "white",
                          border: "1px solid #d5deea",
                          borderRadius: 12,
                          padding: 14,
                          marginTop: 8,
                        }}
                      >
                        <StoredPdf id={doc.id} />
                        <p style={{ margin: "12px 0 8px" }}>
                          {open.owner.name}: {when(open.owner.signedAt)}
                          <br />
                          {open.signer.name}: {when(open.signer.signedAt)}
                        </p>
                        <p style={{ margin: "0 0 8px", fontWeight: 700 }}>{mine ? "Your signature" : `Sign as ${me.name}`}</p>
                        <canvas
                          ref={canvasRef}
                          style={{
                            width: "100%",
                            height: 160,
                            border: "1px solid #d5deea",
                            borderRadius: 8,
                            touchAction: "none",
                            background: "white",
                          }}
                          onPointerDown={(event) => {
                            const canvas = canvasRef.current;
                            const ctx = canvas?.getContext("2d");
                            if (!ctx) return;
                            drawing.current = true;
                            canvas?.setPointerCapture(event.pointerId);
                            const p = point(event);
                            ctx.beginPath();
                            ctx.moveTo(p.x, p.y);
                          }}
                          onPointerMove={(event) => {
                            if (!drawing.current) return;
                            const ctx = canvasRef.current?.getContext("2d");
                            if (!ctx) return;
                            const p = point(event);
                            ctx.lineTo(p.x, p.y);
                            ctx.stroke();
                          }}
                          onPointerUp={() => {
                            drawing.current = false;
                          }}
                        />
                        <button type="button" disabled={busy} onClick={() => void saveSignature()} style={primary}>
                          {busy ? "Saving…" : "Put my signature on the PDF"}
                        </button>
                      </section>
                    ) : null}
                  </div>
                ))
              ) : (
                <p style={{ color: "#5b6b82" }}>None yet.</p>
              )}
            </section>
            {status ? <p style={{ marginTop: 12 }}>{status}</p> : null}
          </>
        )}
      </div>
    </main>
  );
}

function StoredPdf({ id }: { id: string }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [note, setNote] = useState("Opening the document…");

  useEffect(() => {
    const host = holder.current;
    if (!host) return;
    let cancelled = false;
    host.replaceChildren();
    setNote("Opening the document…");
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const res = await fetch(`/api/sign-docs/${id}/file`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("missing");
      const data = new Uint8Array(await res.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data }).promise;
      if (cancelled) return;
      const width = Math.max(host.clientWidth || 320, 280);
      const count = Math.min(pdf.numPages, 12);
      for (let number = 1; number <= count; number += 1) {
        if (cancelled) return;
        const page = await pdf.getPage(number);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.style.display = "block";
        canvas.style.marginBottom = "8px";
        canvas.style.background = "#ffffff";
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        host.appendChild(canvas);
        await page.render({ canvasContext: ctx, viewport }).promise;
      }
      if (!cancelled) setNote("");
    })().catch(() => {
      if (!cancelled) setNote("The document is stored in OzIntel.");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div>
      {note ? <p style={{ margin: "0 0 8px", color: "#5b6b82" }}>{note}</p> : null}
      <div ref={holder} />
    </div>
  );
}

function signaturePng(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width < 1 || canvas.height < 1) return "";
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < pixels.length; i += 16) {
    if (pixels[i] < 250) return canvas.toDataURL("image/png");
  }
  return "";
}

const field: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #d5deea",
  font: "inherit",
  color: "#0c2f6b",
  background: "#f8fafc",
};

const primary: CSSProperties = {
  marginTop: 12,
  padding: "12px 14px",
  borderRadius: 10,
  border: "none",
  background: "#047857",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
  touchAction: "manipulation",
};

const rowButton: CSSProperties = {
  display: "block",
  flex: 1,
  textAlign: "left",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #d5deea",
  background: "white",
  color: "#0c2f6b",
  fontWeight: 700,
  cursor: "pointer",
  touchAction: "manipulation",
};

const deleteButton: CSSProperties = {
  flex: "0 0 auto",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  fontWeight: 700,
  cursor: "pointer",
  touchAction: "manipulation",
};
