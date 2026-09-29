/**
 * Serializes rows to RFC 4180 CSV. Cells beginning with a formula trigger are prefixed with an apostrophe
 * so spreadsheet applications do not evaluate user- or Google-supplied text (CSV injection).
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value);
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvFilename(prefix: string, range: { from: string; to: string }): string {
  return `${prefix.replace(/[^a-z0-9-]/gi, '-')}-${range.from}-to-${range.to}.csv`;
}
