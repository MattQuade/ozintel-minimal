"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

type Party = { email: string; name: string; signedAt?: string };
type SignDoc = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  uploaded: boolean;
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
  const moved = useRef(false);

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
    if (!title.trim()) {
      setStatus("Give the document a title.");
      return;
    }
    setBusy(true);
    setStatus("Making the PDF…");
    try {
      const form = new FormData();
      form.set("title", title.trim());
      form.set("body", body);
      form.set("signerEmail", signerEmail);
      if (file) form.set("file", file);
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
      setStatus("PDF is ready. Sign in the box below.");
      await load();
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
      moved.current = false;
      setStatus("Signature saved on the PDF.");
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
    setStatus("Deleting…");
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
    ctx.strokeStyle = "#0c2f6b";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [open?.id]);
  const mine = me ? open?.owner.email.toLowerCase() === me.email.toLowerCase() : false;
  const waiting = docs.filter((doc) => {
    if (!me) return false;
    const party = doc.owner.email.toLowerCase() === me.email.toLowerCase() ? doc.owner : doc.signer;
    return !party.signedAt;
  });

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#f4f7fb",
        color: "#0c2f6b",
        minHeight: "100vh",
        padding: "calc(20px + env(safe-area-inset-top, 0px)) 16px 48px",
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
          Write it here and OzIntel makes the PDF. Or upload a PDF you saved from Word.
          Sign with your finger, then the other person signs from their OzIntel login.
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
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={field}
              />
              <label style={{ display: "block", fontWeight: 700, margin: "12px 0 6px" }}>
                Document
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder="Type the document. Leave this blank if you are uploading a PDF."
                style={{ ...field, resize: "vertical" }}
              />
              <label style={{ display: "block", fontWeight: 700, margin: "12px 0 6px" }}>
                PDF from Word (optional)
              </label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <label style={{ display: "block", fontWeight: 700, margin: "12px 0 6px" }}>
                Ask this person to sign
              </label>
              <select
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                style={field}
              >
                {people.map((person) => (
                  <option key={person.email} value={person.email}>
                    {person.name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={busy} onClick={() => void createDoc()} style={primary}>
                {busy ? "Working…" : "Make the PDF"}
              </button>
            </section>

            {waiting.length ? (
              <section style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: "1.1rem", margin: "0 0 8px" }}>Waiting for your signature</h2>
                {waiting.map((doc) => (
                  <DocRow key={doc.id} doc={doc} onOpen={() => setOpenId(doc.id)} onDelete={() => void removeDoc(doc.id)} />
                ))}
              </section>
            ) : null}

            <section style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: "1.1rem", margin: "0 0 8px" }}>Your documents</h2>
              {docs.length ? (
                docs.map((doc) => (
                  <DocRow key={doc.id} doc={doc} onOpen={() => setOpenId(doc.id)} onDelete={() => void removeDoc(doc.id)} />
                ))
              ) : (
                <p style={{ color: "#5b6b82" }}>None yet.</p>
              )}
            </section>

            {open ? (
              <section
                style={{
                  background: "white",
                  border: "1px solid #d5deea",
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <h2 style={{ margin: "0 0 8px", fontSize: "1.3rem" }}>{open.title}</h2>
                <p style={{ margin: "0 0 8px" }}>
                  {open.owner.name}: {when(open.owner.signedAt)}
                  <br />
                  {open.signer.name}: {when(open.signer.signedAt)}
                </p>
                <p style={{ margin: "0 0 12px" }}>
                  <a href={`/api/sign-docs/${open.id}/file`} target="_blank" rel="noreferrer">
                    Open the PDF
                  </a>
                  {!open.uploaded && open.body ? (
                    <>
                      {" · "}
                      <a href={`/api/sign-docs/${open.id}/word`}>Download Word</a>
                    </>
                  ) : null}
                </p>
                <p style={{ margin: "0 0 8px", fontWeight: 700 }}>
                  {mine ? "Your signature" : `Sign as ${me.name}`}
                </p>
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
                    moved.current = true;
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
            {status ? <p style={{ marginTop: 12 }}>{status}</p> : null}
          </>
        )}
      </div>
    </main>
  );
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
};

const rowButton: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #d5deea",
  background: "white",
  color: "#0c2f6b",
  fontWeight: 700,
  cursor: "pointer",
};

function DocRow({ doc, onOpen, onDelete }: { doc: SignDoc; onOpen: () => void; onDelete: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch", marginBottom: 8 }}>
      <button type="button" onClick={onOpen} style={{ ...rowButton, flex: 1 }}>
        {doc.title}
        <span style={{ display: "block", fontWeight: 500, color: "#5b6b82" }}>
          {doc.owner.name} and {doc.signer.name}
        </span>
      </button>
      <button type="button" onClick={onDelete} style={deleteButton}>
        Delete
      </button>
    </div>
  );
}

function signaturePng(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width < 1 || canvas.height < 1) return "";
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;
  let ink = false;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const i = (y * canvas.width + x) * 4;
      if (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245) {
        ink = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!ink) return "";
  const pad = 10;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(canvas.width - 1, maxX + pad);
  maxY = Math.min(canvas.height - 1, maxY + pad);
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const scale = Math.min(1, 640 / cropW, 240 / cropH);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cropW * scale));
  out.height = Math.max(1, Math.round(cropH * scale));
  const outCtx = out.getContext("2d");
  if (!outCtx) return "";
  outCtx.fillStyle = "#ffffff";
  outCtx.fillRect(0, 0, out.width, out.height);
  outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

const deleteButton: CSSProperties = {
  flex: "0 0 auto",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  fontWeight: 700,
  cursor: "pointer",
};
