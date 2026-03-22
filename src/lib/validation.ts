/** Validate that a rug number is non-empty after trimming. */
export function isValidRugNumber(value: string): boolean {
  return value.trim().length > 0;
}

/** Check if a set of rug labels contains duplicates. Returns the first duplicate or null. */
export function findDuplicateRugNumber(labels: string[]): string | null {
  const seen = new Set<string>();
  for (const label of labels) {
    const key = label.trim();
    if (!key) continue;
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return null;
}

/** Basic email format validation. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Normalize email to lowercase trimmed form. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** CSV cell sanitization — strip formula injection characters. */
export function sanitizeCsvCell(value: string): string {
  const trimmed = value.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return trimmed.replace(/^[=+\-@\t\r]+/, "");
  }
  return trimmed;
}

/** Parse a CSV string into a 2D array of sanitized cells. Strips UTF-8 BOM if present. */
export function parseCsvRows(rawCsv: string): string[][] {
  // Strip UTF-8 BOM that Excel often prepends
  const csv = rawCsv.startsWith("\uFEFF") ? rawCsv.slice(1) : rawCsv;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let idx = 0; idx < csv.length; idx += 1) {
    const char = csv[idx];
    if (char === "\"") {
      if (inQuotes && csv[idx + 1] === "\"") { cell += "\""; idx += 1; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) { row.push(sanitizeCsvCell(cell)); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && csv[idx + 1] === "\n") idx += 1;
      row.push(sanitizeCsvCell(cell));
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = []; cell = "";
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(sanitizeCsvCell(cell));
    if (row.some((v) => v.length > 0)) rows.push(row);
  }
  return rows;
}
