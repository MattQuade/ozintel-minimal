/** Client-side CSV helpers for accounting reports. */

export function downloadCsv(filename: string, rows: string[][]) {
  const escape = (cell: string | number) => {
    const s = String(cell ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = rows.map((r) => r.map(escape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function moneyCsv(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2);
}
