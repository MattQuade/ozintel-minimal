/**
 * Lightweight "update agent" for Decision Brief scheme sources.
 * Fetches curated public pages and extracts title + snippet — no LLM required.
 * Hit POST /api/decision-brief/scan-updates on a schedule (Render cron / external ping).
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

export async function scanSchemeSources(
  sources: SchemeSource[] = DEFAULT_SCHEME_SOURCES
): Promise<SchemeUpdate[]> {
  const out: SchemeUpdate[] = [];
  const fetchedAt = new Date().toISOString();

  for (const source of sources) {
    try {
      const res = await fetch(source.url, {
        headers: {
          "User-Agent": "OzIntel-DecisionBrief/1.0 (+https://ozintel.com.au)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      });
      if (!res.ok) {
        out.push({
          id: `${source.id}-${Date.now()}`,
          source: source.label,
          title: `${source.label} — fetch failed (${res.status})`,
          url: source.url,
          snippet: "Could not load this source. Will retry on next scan.",
          fetchedAt,
        });
        continue;
      }
      const html = await res.text();
      const title = pickTitle(html, source.label);
      const text = stripTags(html);
      const snippet = text.slice(0, 280) + (text.length > 280 ? "…" : "");
      out.push({
        id: `${source.id}-${fetchedAt.slice(0, 10)}`,
        source: source.label,
        title,
        url: source.url,
        snippet,
        fetchedAt,
      });
    } catch (err) {
      out.push({
        id: `${source.id}-err-${Date.now()}`,
        source: source.label,
        title: `${source.label} — unreachable`,
        url: source.url,
        snippet:
          err instanceof Error ? err.message : "Network error during scan",
        fetchedAt,
      });
    }
  }

  return out;
}
