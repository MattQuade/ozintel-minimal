import { promises as fs } from "fs";
import path from "path";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  StandardFonts,
  decodePDFRawStream,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import sharp from "sharp";
import { getSignDocsDir, getSignDocsIndexPath } from "@/lib/dataPaths";

export type SignParty = {
  email: string;
  name: string;
  signedAt?: string;
};

export type SignDoc = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  /** True when the PDF started as an upload from Word. */
  uploaded: boolean;
  /** Original upload name, unchanged. */
  fileName?: string;
  owner: SignParty;
  signer: SignParty;
};

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function safeId(raw: string): string {
  const id = String(raw || "").trim();
  if (!/^doc-[a-z0-9-]+$/i.test(id)) return "";
  return id;
}

function winAnsi(text: string): string {
  return String(text || "")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function sydneyStamp(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

async function readIndex(): Promise<SignDoc[]> {
  try {
    const raw = await fs.readFile(getSignDocsIndexPath(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SignDoc[]) : [];
  } catch {
    return [];
  }
}

async function writeIndex(docs: SignDoc[]): Promise<void> {
  await fs.mkdir(getSignDocsDir(), { recursive: true });
  await fs.writeFile(getSignDocsIndexPath(), JSON.stringify(docs, null, 2), "utf8");
}

function sourcePath(id: string) {
  return path.join(getSignDocsDir(), `${id}-source.pdf`);
}
function pdfPath(id: string) {
  return path.join(getSignDocsDir(), `${id}.pdf`);
}
function signPath(id: string, role: "owner" | "signer") {
  return path.join(getSignDocsDir(), `${id}-${role}.png`);
}

async function readOptional(file: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(file);
  } catch {
    return null;
  }
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = winAnsi(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) cur = trial;
    else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function drawTextPages(doc: SignDoc, pdf: PDFDocument) {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageW = A4[0];
  const pageH = A4[1];
  const width = pageW - MARGIN * 2;
  let page: PDFPage = pdf.addPage(A4);
  let y = pageH - MARGIN;

  const ensure = (h: number) => {
    if (y - h < MARGIN) {
      page = pdf.addPage(A4);
      y = pageH - MARGIN;
    }
  };

  const draw = (text: string, size: number, face: PDFFont, gap = 4) => {
    ensure(size + gap);
    page.drawText(winAnsi(text), {
      x: MARGIN,
      y: y - size,
      size,
      font: face,
      color: rgb(0.05, 0.12, 0.2),
    });
    y -= size + gap;
  };

  draw(doc.title || "Document", 18, bold, 16);
  const paragraphs = String(doc.body || "").split(/\n/);
  for (const paragraph of paragraphs) {
    const lines = wrapLines(paragraph, font, 12, width);
    if (!lines.length) {
      y -= 10;
      continue;
    }
    for (const line of lines) draw(line, 12, font, 4);
    y -= 8;
  }
}

async function addSignaturePage(
  pdf: PDFDocument,
  doc: SignDoc,
  ownerPng: Buffer | null,
  signerPng: Buffer | null
) {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage(A4);
  const drawLabel = (text: string, x: number, y: number, size: number, face: PDFFont) => {
    page.drawText(winAnsi(text), { x, y, size, font: face, color: rgb(0.05, 0.12, 0.2) });
  };
  drawLabel("Signatures", MARGIN, A4[1] - 80, 18, bold);
  const slots: Array<{ party: SignParty; png: Buffer | null; y: number }> = [
    { party: doc.owner, png: ownerPng, y: 640 },
    { party: doc.signer, png: signerPng, y: 430 },
  ];
  for (const slot of slots) {
    drawLabel(slot.party.name || slot.party.email, MARGIN, slot.y, 13, bold);
    page.drawRectangle({
      x: MARGIN,
      y: slot.y - 130,
      width: 280,
      height: 110,
      borderWidth: 1,
      borderColor: rgb(0.7, 0.75, 0.8),
    });
    if (slot.png) {
      try {
        const image = await pdf.embedPng(slot.png);
        const scale = Math.min(260 / image.width, 90 / image.height);
        page.drawImage(image, {
          x: MARGIN + 10,
          y: slot.y - 120,
          width: image.width * scale,
          height: image.height * scale,
        });
      } catch {
        // A bad image leaves the box blank rather than failing the whole PDF.
      }
    }
    const when = slot.party.signedAt ? `Signed ${sydneyStamp(slot.party.signedAt)}` : "Not signed yet";
    drawLabel(when, MARGIN, slot.y - 150, 11, font);
  }
}

function contentText(pdf: PDFDocument, page: PDFPage): string {
  const contents = page.node.Contents();
  if (!contents) return "";
  const parts: Buffer[] = [];
  const take = (value: unknown) => {
    if (!value) return;
    const looked = value instanceof PDFRef ? pdf.context.lookup(value) : value;
    if (looked instanceof PDFArray) {
      for (let i = 0; i < looked.size(); i += 1) take(looked.get(i));
      return;
    }
    if (looked instanceof PDFRawStream) {
      try {
        parts.push(Buffer.from(decodePDFRawStream(looked).decode()));
      } catch {
        parts.push(Buffer.from(looked.contents));
      }
    }
  };
  take(contents);
  return Buffer.concat(parts).toString("latin1");
}

function pageHasImage(pdf: PDFDocument, page: PDFPage): boolean {
  const resources = page.node.Resources();
  if (!resources) return false;
  const looked = resources instanceof PDFRef ? pdf.context.lookup(resources) : resources;
  if (!(looked instanceof PDFDict)) return false;
  return Boolean(looked.lookup(PDFName.of("XObject")));
}

function pageLooksBlank(pdf: PDFDocument, page: PDFPage): boolean {
  if (pageHasImage(pdf, page)) return false;
  const raw = contentText(pdf, page).replace(/%[^\r\n]*/g, "");
  return !/(\bTj\b|\bTJ\b|\bDo\b)/.test(raw);
}

/** Word often saves a blank page after the letter. Drop those before the signature page. */
function dropTrailingBlankPages(pdf: PDFDocument) {
  while (pdf.getPageCount() > 1) {
    const last = pdf.getPageCount() - 1;
    if (!pageLooksBlank(pdf, pdf.getPage(last))) break;
    pdf.removePage(last);
  }
}

export async function renderSignPdf(doc: SignDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  if (doc.uploaded) {
    const source = await readOptional(sourcePath(doc.id));
    if (source) {
      const src = await PDFDocument.load(source);
      const copied = await pdf.copyPages(src, src.getPageIndices());
      for (const page of copied) pdf.addPage(page);
      dropTrailingBlankPages(pdf);
    } else {
      await drawTextPages(doc, pdf);
    }
  } else {
    await drawTextPages(doc, pdf);
  }
  const ownerPng = await readOptional(signPath(doc.id, "owner"));
  const signerPng = await readOptional(signPath(doc.id, "signer"));
  await addSignaturePage(pdf, doc, ownerPng, signerPng);
  pdf.setTitle(winAnsi(doc.title) || "Document");
  return pdf.save();
}

export function signPdfFileName(fileName: string | undefined, title: string): string {
  const raw = (fileName || title || "Document").replace(/[\r\n"]/g, "").trim();
  const name = /\.pdf$/i.test(raw) ? raw : `${raw}.pdf`;
  return name.slice(0, 180);
}

export function signDocFileName(title: string): string {
  const base = winAnsi(title)
    .replace(/[^\w .'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base || "Document"}.pdf`;
}

const renders = new Map<string, Promise<void>>();

async function saveRendered(doc: SignDoc) {
  const bytes = await renderSignPdf(doc);
  const stillThere = (await readIndex()).some((item) => item.id === doc.id);
  if (!stillThere) {
    await fs.rm(pdfPath(doc.id), { force: true });
    return;
  }
  await fs.mkdir(getSignDocsDir(), { recursive: true });
  await fs.writeFile(pdfPath(doc.id), bytes);
}

/** Rebuild the PDF without making the signature button wait on it. */
function trackRender(doc: SignDoc): Promise<void> {
  const existing = renders.get(doc.id);
  if (existing) return existing;
  const job = saveRendered(doc)
    .catch((error) => {
      console.error("[sign-docs] pdf", error);
    })
    .finally(() => {
      if (renders.get(doc.id) === job) renders.delete(doc.id);
    });
  renders.set(doc.id, job);
  return job;
}

async function fitSignature(png: Buffer): Promise<Buffer> {
  if (!png.length || png.length > 1_500_000) throw new Error("Draw your signature again.");
  try {
    const fitted = await sharp(png, { failOn: "error" })
      .resize({ width: 640, height: 240, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    if (!fitted.length || fitted.length > 400_000) throw new Error("Draw your signature again.");
    return fitted;
  } catch (error) {
    if (error instanceof Error && error.message === "Draw your signature again.") throw error;
    if (png.length <= 400_000) return png;
    throw new Error("Draw your signature again.");
  }
}

export function isSignParty(doc: SignDoc, email: string): "owner" | "signer" | "" {
  const who = String(email || "").trim().toLowerCase();
  if (!who) return "";
  if (doc.owner.email === who) return "owner";
  if (doc.signer.email === who) return "signer";
  return "";
}

export async function listSignDocs(email: string): Promise<SignDoc[]> {
  const who = String(email || "").trim().toLowerCase();
  const docs = await readIndex();
  return docs
    .filter((doc) => isSignParty(doc, who))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getSignDoc(id: string, email: string): Promise<SignDoc | null> {
  const safe = safeId(id);
  if (!safe) return null;
  const docs = await readIndex();
  const doc = docs.find((item) => item.id === safe) || null;
  if (!doc || !isSignParty(doc, email)) return null;
  return doc;
}

export async function createSignDoc(input: {
  title: string;
  body: string;
  owner: { email: string; name: string };
  signer: { email: string; name: string };
  pdf?: Buffer;
  fileName?: string;
}): Promise<SignDoc> {
  const fileName = String(input.fileName || "").trim().slice(0, 180);
  const title = String(input.title || fileName || "").trim().slice(0, 180);
  const body = String(input.body || "").trim().slice(0, 40000);
  if (!title) throw new Error("Give the document a title.");
  if (!body && !input.pdf?.length) throw new Error("Write the document or upload the PDF.");
  if (input.pdf && input.pdf.length > 6_000_000) throw new Error("That PDF is too large.");
  const ownerEmail = input.owner.email.trim().toLowerCase();
  const signerEmail = input.signer.email.trim().toLowerCase();
  if (!ownerEmail || !signerEmail) throw new Error("Choose who else signs.");
  if (ownerEmail === signerEmail) throw new Error("Pick someone else to sign as well.");

  return enqueue(async () => {
    const doc: SignDoc = {
      id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      body,
      createdAt: new Date().toISOString(),
      uploaded: Boolean(input.pdf?.length),
      fileName,
      owner: { email: ownerEmail, name: input.owner.name.trim() || ownerEmail },
      signer: { email: signerEmail, name: input.signer.name.trim() || signerEmail },
    };
    await fs.mkdir(getSignDocsDir(), { recursive: true });
    if (input.pdf?.length) await fs.writeFile(sourcePath(doc.id), input.pdf);
    const docs = await readIndex();
    docs.push(doc);
    await writeIndex(docs);
    return doc;
  }).then(async (doc) => {
    await trackRender(doc);
    return doc;
  });
}

export async function signSignDoc(input: {
  id: string;
  email: string;
  png: Buffer;
}): Promise<SignDoc> {
  const safe = safeId(input.id);
  if (!safe) throw new Error("Document not found.");
  const png = await fitSignature(input.png);
  const next = await enqueue(async () => {
    const docs = await readIndex();
    const idx = docs.findIndex((item) => item.id === safe);
    if (idx < 0) throw new Error("Document not found.");
    const role = isSignParty(docs[idx], input.email);
    if (!role) throw new Error("This document is not yours to sign.");
    await fs.mkdir(getSignDocsDir(), { recursive: true });
    await fs.writeFile(signPath(safe, role), png);
    const party = { ...docs[idx][role], signedAt: new Date().toISOString() };
    const updated: SignDoc = { ...docs[idx], [role]: party };
    docs[idx] = updated;
    await writeIndex(docs);
    return updated;
  });
  void trackRender(next);
  return next;
}

export async function deleteSignDoc(id: string, email: string): Promise<void> {
  const safe = safeId(id);
  if (!safe) throw new Error("Document not found.");
  await enqueue(async () => {
    const docs = await readIndex();
    const idx = docs.findIndex((item) => item.id === safe);
    if (idx < 0 || !isSignParty(docs[idx], email)) throw new Error("Document not found.");
    docs.splice(idx, 1);
    await writeIndex(docs);
    await Promise.all(
      [pdfPath(safe), sourcePath(safe), signPath(safe, "owner"), signPath(safe, "signer")].map((file) =>
        fs.rm(file, { force: true })
      )
    );
  });
}

export async function readSignPdf(id: string, email: string): Promise<Buffer | null> {
  const doc = await getSignDoc(id, email);
  if (!doc) return null;
  const pending = renders.get(doc.id);
  if (pending) await pending;
  try {
    await saveRendered(doc);
  } catch (error) {
    console.error("[sign-docs] pdf", error);
  }
  return readOptional(pdfPath(doc.id));
}

export function signDocWordHtml(doc: SignDoc): string {
  const esc = (value: string) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const paragraphs = esc(doc.body)
    .split(/\n/)
    .map((line) => `<p>${line || "&nbsp;"}</p>`)
    .join("");
  return `<html><head><meta charset="utf-8"></head><body><h1>${esc(doc.title)}</h1>${paragraphs}</body></html>`;
}
