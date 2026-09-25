import { permanentEmail } from '@noderails/common';

const MAX_CSV_ROWS = 5_000;
const FORMULA_PREFIX = /^[=+\-@]/;
const EMAIL_HEADERS = new Set(['email', 'e-mail', 'emails', 'email address']);
const NAME_HEADERS = new Set(['name', 'full name', 'fullname']);

export interface ParsedPeopleLine {
  email: string;
  name?: string;
  row: number;
}

export interface PeopleCsvError {
  row: number;
  message: string;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if ((ch === ',' || ch === ';') && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out.filter((col) => col.length > 0);
}

function parseEmail(value: string): string | null {
  const parsed = permanentEmail().safeParse(value.trim());
  return parsed.success ? parsed.data.toLowerCase() : null;
}

function looksLikeHeaderRow(line: string): boolean {
  const cols = splitCsvLine(line).map((h) => h.toLowerCase());
  if (cols.some((col) => col.includes('@'))) return false;
  return cols.some((col) => EMAIL_HEADERS.has(col));
}

function headerIndex(header: string[], aliases: Set<string>): number {
  return header.findIndex((col) => aliases.has(col));
}

function pushLine(
  lines: ParsedPeopleLine[],
  errors: PeopleCsvError[],
  seen: Set<string>,
  rawEmail: string,
  rawName: string | undefined,
  row: number,
) {
  if (FORMULA_PREFIX.test(rawEmail) || (rawName && FORMULA_PREFIX.test(rawName))) {
    errors.push({ row, message: 'value looks like a spreadsheet formula' });
    return;
  }
  const email = parseEmail(rawEmail);
  if (!email) {
    errors.push({ row, message: 'email is not valid' });
    return;
  }
  if (seen.has(email)) return;
  seen.add(email);
  const name = rawName?.trim() ?? '';
  lines.push({
    email,
    row,
    ...(name && name.length <= 120 ? { name } : {}),
  });
}

function parseHeaderedRows(
  headerLine: string,
  dataRows: Array<{ line: string; row: number }>,
): { lines: ParsedPeopleLine[]; errors: PeopleCsvError[] } {
  const header = splitCsvLine(headerLine).map((h) => h.toLowerCase());
  const emailIdx = headerIndex(header, EMAIL_HEADERS);
  const nameIdx = headerIndex(header, NAME_HEADERS);
  if (emailIdx < 0) {
    return { lines: [], errors: [{ row: 1, message: 'csv header must include email (name optional)' }] };
  }

  const lines: ParsedPeopleLine[] = [];
  const errors: PeopleCsvError[] = [];
  const seen = new Set<string>();

  for (const { line, row } of dataRows) {
    const cols = splitCsvLine(line);
    const email = cols[emailIdx] ?? '';
    const name = nameIdx >= 0 ? (cols[nameIdx] ?? '') : '';
    pushLine(lines, errors, seen, email, name, row);
  }

  return { lines, errors };
}

function parseLooseRows(rows: Array<{ line: string; row: number }>): {
  lines: ParsedPeopleLine[];
  errors: PeopleCsvError[];
} {
  const lines: ParsedPeopleLine[] = [];
  const errors: PeopleCsvError[] = [];
  const seen = new Set<string>();

  for (const { line, row } of rows) {
    const cols = splitCsvLine(line);
    const emails = cols.map((col) => ({ col, email: parseEmail(col) })).filter((item) => item.email);

    if (emails.length >= 2) {
      for (const item of emails) {
        pushLine(lines, errors, seen, item.email!, undefined, row);
      }
      continue;
    }

    if (emails.length === 1) {
      const email = emails[0]!.email!;
      const name = cols.filter((col) => parseEmail(col) !== email).join(' ').trim();
      pushLine(lines, errors, seen, email, name || undefined, row);
      continue;
    }

    const tokens = line.split(/\s+/).map((token) => token.trim()).filter(Boolean);
    const tokenEmails = tokens.map((token) => parseEmail(token)).filter((email): email is string => Boolean(email));
    if (tokenEmails.length) {
      for (const email of tokenEmails) {
        pushLine(lines, errors, seen, email, undefined, row);
      }
      continue;
    }

    errors.push({ row, message: 'email is not valid' });
  }

  return { lines, errors };
}

export function parsePeopleCsv(csv: string): { lines: ParsedPeopleLine[]; errors: PeopleCsvError[] } {
  if (typeof csv !== 'string' || !csv.trim()) {
    return { lines: [], errors: [{ row: 0, message: 'Paste emails or a CSV with an email column' }] };
  }

  const rawLines = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const nonEmpty = rawLines
    .map((line, idx) => ({ line: line.trim(), row: idx + 1 }))
    .filter((x) => x.line.length > 0);

  if (nonEmpty.length === 0) {
    return { lines: [], errors: [{ row: 0, message: 'Nothing to import' }] };
  }

  if (nonEmpty.length - (looksLikeHeaderRow(nonEmpty[0]!.line) ? 1 : 0) > MAX_CSV_ROWS) {
    return { lines: [], errors: [{ row: 1, message: `Cannot import more than ${MAX_CSV_ROWS} emails at once` }] };
  }

  if (looksLikeHeaderRow(nonEmpty[0]!.line)) {
    return parseHeaderedRows(nonEmpty[0]!.line, nonEmpty.slice(1));
  }

  return parseLooseRows(nonEmpty);
}
