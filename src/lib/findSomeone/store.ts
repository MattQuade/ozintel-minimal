/**
 * Find Someone store — anonymous posts, private answers, matched messaging.
 * Emails are never returned in public list payloads.
 */

import { promises as fs } from "fs";
import { randomBytes } from "crypto";
import {
  getFindSomeoneAnswersPath,
  getFindSomeoneDir,
  getFindSomeoneMessagesPath,
  getFindSomeonePostsPath,
} from "@/lib/dataPaths";
import { normalizeOwnerEmail } from "@/lib/dataOwnerContext";

export type FindSomeonePost = {
  id: string;
  placeText: string;
  approxDate: string;
  question: string;
  createdAt: string;
  status: "open" | "matched" | "closed";
  authorEmail: string;
  matchedWithEmail?: string;
  matchedAt?: string;
  acceptedAnswerId?: string;
};

export type FindSomeoneAnswer = {
  id: string;
  postId: string;
  answerText: string;
  createdAt: string;
  responderEmail: string;
};

export type FindSomeoneMessage = {
  id: string;
  postId: string;
  fromEmail: string;
  body: string;
  createdAt: string;
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

async function ensureDir() {
  await fs.mkdir(getFindSomeoneDir(), { recursive: true });
}

async function readJsonArray<T>(filePath: string): Promise<T[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeJsonArray<T>(filePath: string, rows: T[]): Promise<void> {
  await ensureDir();
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf8");
  try {
    await fs.rename(tmp, filePath);
  } catch {
    await fs.copyFile(tmp, filePath);
    await fs.unlink(tmp).catch(() => undefined);
  }
}

function emailsEqual(a: string, b: string): boolean {
  return normalizeOwnerEmail(a) === normalizeOwnerEmail(b);
}

export function publicPostCard(post: FindSomeonePost) {
  return {
    id: post.id,
    placeText: post.placeText,
    approxDate: post.approxDate,
    question: post.question,
    createdAt: post.createdAt,
    status: post.status,
  };
}

export async function listPosts(): Promise<FindSomeonePost[]> {
  const posts = await readJsonArray<FindSomeonePost>(getFindSomeonePostsPath());
  return posts.sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );
}

export async function getPost(id: string): Promise<FindSomeonePost | null> {
  const posts = await listPosts();
  return posts.find((p) => p.id === id) || null;
}

export async function createPost(args: {
  authorEmail: string;
  placeText: string;
  approxDate: string;
  question: string;
}): Promise<FindSomeonePost> {
  const placeText = String(args.placeText || "").trim().slice(0, 240);
  const approxDate = String(args.approxDate || "").trim().slice(0, 40);
  const question = String(args.question || "").trim().slice(0, 500);
  if (!placeText) throw new Error("Place is required (country / city / town).");
  if (!approxDate) throw new Error("Approximate date is required (dd/mm/yyyy).");
  if (!question) throw new Error("Recognition question is required.");

  const post: FindSomeonePost = {
    id: newId("fs"),
    placeText,
    approxDate,
    question,
    createdAt: new Date().toISOString(),
    status: "open",
    authorEmail: normalizeOwnerEmail(args.authorEmail),
  };
  const posts = await listPosts();
  posts.unshift(post);
  await writeJsonArray(getFindSomeonePostsPath(), posts);
  return post;
}

export async function listAnswersForPost(
  postId: string
): Promise<FindSomeoneAnswer[]> {
  const answers = await readJsonArray<FindSomeoneAnswer>(
    getFindSomeoneAnswersPath()
  );
  return answers
    .filter((a) => a.postId === postId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function submitAnswer(args: {
  postId: string;
  responderEmail: string;
  answerText: string;
}): Promise<FindSomeoneAnswer> {
  const post = await getPost(args.postId);
  if (!post) throw new Error("Post not found.");
  if (post.status !== "open") throw new Error("This post is no longer open.");
  if (emailsEqual(post.authorEmail, args.responderEmail)) {
    throw new Error("You cannot answer your own post.");
  }
  const answerText = String(args.answerText || "").trim().slice(0, 500);
  if (!answerText) throw new Error("Answer is required.");

  const existing = await listAnswersForPost(post.id);
  if (
    existing.some((a) => emailsEqual(a.responderEmail, args.responderEmail))
  ) {
    throw new Error("You already submitted an answer on this post.");
  }

  const answer: FindSomeoneAnswer = {
    id: newId("fsa"),
    postId: post.id,
    answerText,
    createdAt: new Date().toISOString(),
    responderEmail: normalizeOwnerEmail(args.responderEmail),
  };
  const all = await readJsonArray<FindSomeoneAnswer>(getFindSomeoneAnswersPath());
  all.unshift(answer);
  await writeJsonArray(getFindSomeoneAnswersPath(), all);
  return answer;
}

/** Poster accepts one anonymous answer → open private chat with that responder. */
export async function acceptAnswer(args: {
  postId: string;
  answerId: string;
  authorEmail: string;
}): Promise<FindSomeonePost> {
  const posts = await listPosts();
  const idx = posts.findIndex((p) => p.id === args.postId);
  if (idx < 0) throw new Error("Post not found.");
  const post = posts[idx];
  if (!emailsEqual(post.authorEmail, args.authorEmail)) {
    throw new Error("Only the person who posted can accept an answer.");
  }
  if (post.status !== "open") throw new Error("This post is already matched.");

  const answers = await listAnswersForPost(post.id);
  const answer = answers.find((a) => a.id === args.answerId);
  if (!answer) throw new Error("Answer not found.");

  const updated: FindSomeonePost = {
    ...post,
    status: "matched",
    matchedWithEmail: answer.responderEmail,
    matchedAt: new Date().toISOString(),
    acceptedAnswerId: answer.id,
  };
  posts[idx] = updated;
  await writeJsonArray(getFindSomeonePostsPath(), posts);
  return updated;
}

export function isPartyOnPost(
  post: FindSomeonePost,
  email: string
): "author" | "matched" | "none" {
  if (emailsEqual(post.authorEmail, email)) return "author";
  if (
    post.matchedWithEmail &&
    emailsEqual(post.matchedWithEmail, email)
  ) {
    return "matched";
  }
  return "none";
}

export async function listMessages(
  postId: string
): Promise<FindSomeoneMessage[]> {
  const messages = await readJsonArray<FindSomeoneMessage>(
    getFindSomeoneMessagesPath()
  );
  return messages
    .filter((m) => m.postId === postId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function postMessage(args: {
  postId: string;
  fromEmail: string;
  body: string;
}): Promise<FindSomeoneMessage> {
  const post = await getPost(args.postId);
  if (!post) throw new Error("Post not found.");
  if (post.status !== "matched") {
    throw new Error("Messaging opens after a match is accepted.");
  }
  const role = isPartyOnPost(post, args.fromEmail);
  if (role === "none") throw new Error("Not part of this match.");

  const body = String(args.body || "").trim().slice(0, 2000);
  if (!body) throw new Error("Message cannot be empty.");

  const message: FindSomeoneMessage = {
    id: newId("fsm"),
    postId: post.id,
    fromEmail: normalizeOwnerEmail(args.fromEmail),
    body,
    createdAt: new Date().toISOString(),
  };
  const all = await readJsonArray<FindSomeoneMessage>(
    getFindSomeoneMessagesPath()
  );
  all.push(message);
  await writeJsonArray(getFindSomeoneMessagesPath(), all);
  return message;
}

/** Role-aware detail payload — keeps emails and other users' answers private. */
export async function buildPostDetail(args: {
  postId: string;
  viewerEmail: string;
}) {
  const post = await getPost(args.postId);
  if (!post) return null;

  const role = isPartyOnPost(post, args.viewerEmail);
  const isAuthor = role === "author";
  const isMatchedParty = role === "author" || role === "matched";
  const answers = await listAnswersForPost(post.id);
  const myAnswer = answers.find((a) =>
    emailsEqual(a.responderEmail, args.viewerEmail)
  );

  return {
    post: publicPostCard(post),
    viewerRole: isAuthor
      ? "author"
      : role === "matched"
        ? "matched"
        : myAnswer
          ? "answered"
          : "visitor",
    canMessage: isMatchedParty && post.status === "matched",
    /** Only the original poster sees submitted answers. */
    answers: isAuthor
      ? answers.map((a) => ({
          id: a.id,
          answerText: a.answerText,
          createdAt: a.createdAt,
          accepted: post.acceptedAnswerId === a.id,
        }))
      : [],
    myAnswerSubmitted: Boolean(myAnswer),
  };
}
