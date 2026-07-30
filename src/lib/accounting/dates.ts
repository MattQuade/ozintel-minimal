/**
 * Australian date helpers (display DD/MM/YYYY).
 * HTML <input type="date"> still uses ISO yyyy-mm-dd for the value attribute.
 */

export function parseFlexibleDate(
  dateStr: string | Date | null | undefined
): Date | null {
  if (dateStr == null || dateStr === "") return null;
  if (dateStr instanceof Date) {
    return Number.isNaN(dateStr.getTime()) ? null : dateStr;
  }
  const trimmed = String(dateStr).trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed.slice(0, 10) + "T12:00:00");
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const iso = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    const d = new Date(iso + "T12:00:00");
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dmyShort = trimmed.match(/^(\d{1,2})[\/\-]([A-Za-z]{3})[\/\-](\d{2,4})$/);
  if (dmyShort) {
    const months: Record<string, string> = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    const mon = months[dmyShort[2].toLowerCase().slice(0, 3)];
    if (mon) {
      let y = dmyShort[3];
      if (y.length === 2) y = `20${y}`;
      const iso = `${y}-${mon}-${dmyShort[1].padStart(2, "0")}`;
      const d = new Date(iso + "T12:00:00");
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local calendar day as yyyy-mm-dd (for comparisons / date inputs). */
export function toIsoDateInput(
  input: string | Date | null | undefined
): string {
  const d = parseFlexibleDate(input);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Always display as DD/MM/YYYY. */
export function formatAuDate(
  input: string | Date | null | undefined
): string {
  if (input == null || input === "") return "";
  const asString = typeof input === "string" ? input.trim() : "";
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(asString)) {
    const [d, m, y] = asString.split("/");
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
  }
  const d = parseFlexibleDate(input);
  if (!d) return asString || "";
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${m}/${d.getFullYear()}`;
}

export function formatAuDateRange(
  from: string | Date | null | undefined,
  to: string | Date | null | undefined
): string {
  return `${formatAuDate(from)} – ${formatAuDate(to)}`;
}
