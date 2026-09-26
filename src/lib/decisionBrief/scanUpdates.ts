/**
 * Lightweight "update agent" for Decision Brief scheme sources.
 * Fetches curated public pages and extracts title + snippet — no LLM required.
 * Hit POST /api/decision-brief/scan-updates on a schedule (Render cron / external ping).
 *
 * Live fetches can fail (egress / bot blocks). Curated catalogue in schemes.ts
 * remains the source of truth for stacking answers; scans only refresh "what changed".
 */

import type { SchemeUpdate } from "@/lib/decisionBrief/store";

export type SchemeSource = {
  id: string;
  label: string;
  url: string;
};

/** Starting set — expand as the Masters research identifies better feeds. */
export const DEFAULT_SCHEME_SOURCES: SchemeSource[] = [
  {
    id: "energy-gov-cheaper-home-batteries",
    label: "energy.gov.au — Cheaper Home Batteries",
    url: "https://www.energy.gov.au/rebates/cheaper-home-batteries-program",
  },
  {
    id: "nsw-batteries-for-businesses",
    label: "NSW — Batteries for businesses (PDRS)",
    url: "https://www.energy.nsw.gov.au/business-and-industry/programs-grants-and-schemes/business-equipment/batteries-businesses-incentive",
  },
  {
    id: "energy-gov-solar",
    label: "energy.gov.au — Solar",
    url: "https://www.energy.gov.au/topics/renewable-energy/solar",
  },
  {
    id: "cer-home",
    label: "Clean Energy Regulator",
    url: "https://www.cleanenergyregulator.gov.au/",
  },
];

const FETCH_TIMEOUT_MS = 8000;

function stripTags(html: string): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pickTitle(html: string, fallback: string): string {
  const og = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
  );
  if (og?.[1]) return og[1].trim();
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (t?.[1]) return t[1].replace(/\s+/g, " ").trim();
  return fallback;
}

function isFailedUpdate(u: Pick<SchemeUpdate, "title" | "status">): boolean {
  if (u.status === "error") return true;
  const title = String(u.title || "").toLowerCase();
  return (
    title.includes("unreachable") ||
    title.includes("fetch failed") ||
    title.includes("unteachable")
  );
}

export { isFailedUpdate };

async function scanOneSource(
  source: SchemeSource,
  fetchedAt: string
): Promise<SchemeUpdate> {
  try {
    const res = await fetch(source.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; OzIntel-DecisionBrief/1.1; +https://ozintel.com.au)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) {
      return {
        id: `${source.id}-${fetchedAt.slice(0, 10)}`,
        sourceId: source.id,
        source: source.label,
        title: `${source.label} — fetch failed (${res.status})`,
        url: source.url,
        snippet: "Could not load this source. Will retry on next scan.",
        fetchedAt,
        status: "error",
      };
    }
    const html = await res.text();
    const title = pickTitle(html, source.label);
    const text = stripTags(html);
    const snippet = text.slice(0, 280) + (text.length > 280 ? "…" : "");
    return {
      id: `${source.id}-${fetchedAt.slice(0, 10)}`,
      sourceId: source.id,
      source: source.label,
      title,
      url: source.url,
      snippet,
      fetchedAt,
      status: "ok",
    };
  } catch (err) {
    return {
      id: `${source.id}-${fetchedAt.slice(0, 10)}`,
      sourceId: source.id,
      source: source.label,
      title: `${source.label} — unreachable`,
      url: source.url,
      snippet:
        err instanceof Error ? err.message : "Network error during scan",
      fetchedAt,
      status: "error",
    };
  }
}

export async function scanSchemeSources(
  sources: SchemeSource[] = DEFAULT_SCHEME_SOURCES
): Promise<SchemeUpdate[]> {
  const fetchedAt = new Date().toISOString();
  const results = await Promise.all(
    sources.map((source) => scanOneSource(source, fetchedAt))
  );
  // Successful sources first so the brief headline prefers real content.
  return [
    ...results.filter((u) => u.status === "ok"),
    ...results.filter((u) => u.status !== "ok"),
  ];
}
