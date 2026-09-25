import { ValidationError, permanentEmail } from '@noderails/common';

const MAX_CSV_ROWS = 200;
const FORMULA_PREFIX = /^[=+\-@]/;

export interface ParsedPayrollLine {
  label: string;
  wallet: string;
  amount?: string;
  email?: string;
  row: number;
}

export interface PayrollCsvError {
  row: number;
  message: string;
}

export interface ParsedPayrollCsv {
  lines: ParsedPayrollLine[];
  errors: PayrollCsvError[];
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
    if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function rejectFormula(value: string, field: string, row: number): string | null {
  if (FORMULA_PREFIX.test(value)) {
    return `Row ${row}: ${field} looks like a spreadsheet formula`;
  }
  return null;
}

export function parsePayrollCsv(csv: string): ParsedPayrollCsv {
  if (typeof csv !== 'string' || !csv.trim()) {
    throw new ValidationError('csv is required');
  }

  const rawLines = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const nonEmpty = rawLines
    .map((line, idx) => ({ line: line.trim(), row: idx + 1 }))
    .filter((x) => x.line.length > 0);

  if (nonEmpty.length === 0) {
    throw new ValidationError('csv is empty');
  }

  const header = splitCsvLine(nonEmpty[0]!.line).map((h) => h.toLowerCase());
  const labelIdx = header.indexOf('label');
  const walletIdx = header.indexOf('wallet');
  const amountIdx = header.indexOf('amount');
  const emailIdx = header.indexOf('email');
  if (labelIdx < 0 || walletIdx < 0) {
    throw new ValidationError('csv header must include label,wallet (email and amount optional)');
  }

  const dataRows = nonEmpty.slice(1);
  if (dataRows.length > MAX_CSV_ROWS) {
    throw new ValidationError(`csv cannot have more than ${MAX_CSV_ROWS} data rows`);
  }

  const lines: ParsedPayrollLine[] = [];
  const errors: PayrollCsvError[] = [];

  for (const { line, row } of dataRows) {
    const cols = splitCsvLine(line);
    const label = (cols[labelIdx] ?? '').trim();
    const wallet = (cols[walletIdx] ?? '').trim();
    const amount = amountIdx >= 0 ? (cols[amountIdx] ?? '').trim() : '';
    const email = emailIdx >= 0 ? (cols[emailIdx] ?? '').trim() : '';

    const formulaErr =
      rejectFormula(label, 'label', row)
      ?? rejectFormula(wallet, 'wallet', row)
      ?? (amount ? rejectFormula(amount, 'amount', row) : null)
      ?? (email ? rejectFormula(email, 'email', row) : null);
    if (formulaErr) {
      errors.push({ row, message: formulaErr });
      continue;
    }
    if (!label || label.length > 80) {
      errors.push({ row, message: 'label is required (max 80 characters)' });
      continue;
    }
    if (!wallet) {
      errors.push({ row, message: 'wallet is required' });
      continue;
    }
    if (amount && !/^\d+(\.\d+)?$/.test(amount)) {
      errors.push({ row, message: 'amount must be a human decimal string' });
      continue;
    }
    if (email && !permanentEmail().safeParse(email).success) {
      errors.push({ row, message: 'email is not valid' });
      continue;
    }

    lines.push({
      label,
      wallet,
      row,
      ...(amount ? { amount } : {}),
      ...(email ? { email: email.toLowerCase() } : {}),
    });
  }

  return { lines, errors };
}
