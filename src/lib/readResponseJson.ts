/**
 * Parse JSON from a fetch Response. HTML error pages (DOCTYPE) otherwise
 * surface as "Unexpected token '<' is not valid JSON".
 */
export async function readResponseJson<T = Record<string, unknown>>(
  res: Response
): Promise<T> {
  const text = await res.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.status >= 500
        ? `Server error (${res.status}). Try again in a moment.`
        : `Request failed (${res.status || "network"}). Try again, or start a blank invoice.`
    );
  }
}
