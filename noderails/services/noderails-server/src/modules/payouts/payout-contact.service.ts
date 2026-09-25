import { getDatabaseClient, ChainType } from '@noderails/database';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  isValidAddress,
  isValidSolanaAddress,
  isValidSuiAddress,
  normalizeSuiAddress,
} from '@noderails/common';
import { getAddress } from 'viem';
import { parsePayrollCsv } from './payout-csv.js';
import { assertEmailCanReceiveMail } from '../../lib/email-mx.js';

export type ContactFamily = 'EVM' | 'SOLANA' | 'SUI';

function toChainType(family: ContactFamily): ChainType {
  if (family === 'SOLANA') return ChainType.SOLANA;
  if (family === 'SUI') return ChainType.SUI;
  return ChainType.EVM;
}

function normalizeWallet(family: ContactFamily, wallet: string): string {
  const trimmed = wallet.trim();
  if (family === 'EVM') {
    if (!isValidAddress(trimmed)) throw new ValidationError('Invalid EVM wallet');
    return getAddress(trimmed);
  }
  if (family === 'SOLANA') {
    if (!isValidSolanaAddress(trimmed)) throw new ValidationError('Invalid Solana wallet');
    return trimmed;
  }
  if (!isValidSuiAddress(trimmed)) throw new ValidationError('Invalid Sui wallet');
  return normalizeSuiAddress(trimmed);
}

async function requireApp(merchantId: string, appId: string) {
  const db = getDatabaseClient();
  const app = await db.app.findUnique({ where: { id: appId } });
  if (!app) throw new NotFoundError('App', appId);
  if (app.merchantId !== merchantId) throw new AuthorizationError('Access denied');
  return app;
}

export async function createContact(input: {
  merchantId: string;
  appId: string;
  label: string;
  wallet: string;
  family: ContactFamily;
  email?: string;
}) {
  await requireApp(input.merchantId, input.appId);
  if (input.email?.trim()) {
    await assertEmailCanReceiveMail(input.email);
  }
  const label = input.label.trim();
  if (!label || label.length > 80) {
    throw new ValidationError('label is required (max 80 characters)');
  }
  const wallet = normalizeWallet(input.family, input.wallet);
  const db = getDatabaseClient();
  try {
    return await db.payoutContact.create({
      data: {
        merchantId: input.merchantId,
        appId: input.appId,
        label,
        wallet,
        family: toChainType(input.family),
        email: input.email?.trim() ? input.email.trim().toLowerCase() : undefined,
      },
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      throw new ValidationError('That wallet is already in the address book');
    }
    throw err;
  }
}

export async function getContact(merchantId: string, appId: string, contactId: string) {
  const db = getDatabaseClient();
  const contact = await db.payoutContact.findUnique({ where: { id: contactId } });
  if (!contact || contact.merchantId !== merchantId || contact.appId !== appId) {
    throw new NotFoundError('PayoutContact', contactId);
  }
  return contact;
}

export async function listContacts(input: {
  merchantId: string;
  appId: string;
  family?: ContactFamily;
  page?: number;
  pageSize?: number;
}) {
  await requireApp(input.merchantId, input.appId);
  const db = getDatabaseClient();
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  const where: Record<string, unknown> = { merchantId: input.merchantId, appId: input.appId };
  if (input.family) where.family = toChainType(input.family);

  const [contacts, total] = await Promise.all([
    db.payoutContact.findMany({ where, orderBy: { label: 'asc' }, skip, take: pageSize }),
    db.payoutContact.count({ where }),
  ]);
  return { contacts, total, page, pageSize };
}

export async function updateContact(
  merchantId: string,
  appId: string,
  contactId: string,
  input: { label?: string; wallet?: string; family?: ContactFamily; email?: string },
) {
  const existing = await getContact(merchantId, appId, contactId);
  const family = input.family ?? (existing.family as ContactFamily);
  const data: { label?: string; wallet?: string; family?: ChainType; email?: string | null } = {};
  if (input.email !== undefined) {
    if (input.email.trim()) {
      await assertEmailCanReceiveMail(input.email);
      data.email = input.email.trim().toLowerCase();
    } else {
      data.email = null;
    }
  }
  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label || label.length > 80) {
      throw new ValidationError('label is required (max 80 characters)');
    }
    data.label = label;
  }
  if (input.wallet !== undefined || input.family !== undefined) {
    data.wallet = normalizeWallet(family, input.wallet ?? existing.wallet);
    data.family = toChainType(family);
  }
  const db = getDatabaseClient();
  try {
    return await db.payoutContact.update({ where: { id: existing.id }, data });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      throw new ValidationError('That wallet is already in the address book');
    }
    throw err;
  }
}

export async function deleteContact(merchantId: string, appId: string, contactId: string) {
  const existing = await getContact(merchantId, appId, contactId);
  const db = getDatabaseClient();
  await db.payoutContact.delete({ where: { id: existing.id } });
}

export async function importContacts(input: {
  merchantId: string;
  appId: string;
  csv: string;
  family: ContactFamily;
  saveToAddressBook?: boolean;
}) {
  await requireApp(input.merchantId, input.appId);
  const parsed = parsePayrollCsv(input.csv);
  const lines: Array<{ label: string; wallet: string; amount?: string; email?: string; row: number }> = [];
  const errors = [...parsed.errors];

  for (const line of parsed.lines) {
    try {
      if (line.email) {
        await assertEmailCanReceiveMail(line.email);
      }
      const wallet = normalizeWallet(input.family, line.wallet);
      lines.push({ label: line.label, wallet, amount: line.amount, email: line.email, row: line.row });
    } catch (err) {
      errors.push({
        row: line.row,
        message: err instanceof Error ? `${line.label}: ${err.message}` : String(err),
      });
    }
  }

  let contactsSaved = 0;
  if (input.saveToAddressBook) {
    for (const line of lines) {
      try {
        await createContact({
          merchantId: input.merchantId,
          appId: input.appId,
          label: line.label,
          wallet: line.wallet,
          family: input.family,
          email: line.email,
        });
        contactsSaved += 1;
      } catch (err) {
        if (err instanceof ValidationError && err.message.includes('already')) {
          continue;
        }
        errors.push({
          row: line.row,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    lines: lines.map(({ label, wallet, amount, email }) => ({ label, wallet, amount, email })),
    contactsSaved,
    errors,
  };
}
