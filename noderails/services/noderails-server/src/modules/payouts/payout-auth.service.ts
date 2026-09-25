import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { getDatabaseClient } from '@noderails/database';
import {
  ValidationError,
  isValidAddress,
  isValidSolanaAddress,
  isValidSuiAddress,
} from '@noderails/common';
import {
  PAYOUT_AUTH_PURPOSE,
  buildAuthorizePayoutsTypedData,
} from '@noderails/web3';
import {
  buildSolanaPayoutAuthMessage,
  buildSolanaSessionMessage,
} from '@noderails/solana';
import { buildSuiPayoutAuthMessage } from '@noderails/sui';
import { PublicKey } from '@solana/web3.js';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { recoverTypedDataAddress, type Address, type Hex } from 'viem';
import bs58 from 'bs58';
import { getApp } from '../apps/app.service.js';

export const PAYOUT_AUTH_TTL_SEC = 365 * 24 * 60 * 60;
export const PAYOUT_AUTH_FAMILIES = ['EVM', 'SOLANA', 'SUI'] as const;
export type PayoutAuthFamily = (typeof PAYOUT_AUTH_FAMILIES)[number];

function ed25519SpkiFromRaw(raw32: Uint8Array): Uint8Array {
  const prefix = Uint8Array.from(Buffer.from('302a300506032b6570032100', 'hex'));
  const out = new Uint8Array(prefix.length + raw32.length);
  out.set(prefix, 0);
  out.set(raw32, prefix.length);
  return out;
}

export function verifyEd25519(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  if (signature.length !== 64 || publicKey.length !== 32) return false;
  try {
    return cryptoVerify(
      null,
      message,
      createPublicKey({
        key: Buffer.from(ed25519SpkiFromRaw(publicKey)),
        format: 'der',
        type: 'spki',
      }),
      signature,
    );
  } catch {
    return false;
  }
}

export function parseEd25519Signature64(input: string): Uint8Array {
  const s = input.trim();
  if (s.startsWith('0x') && s.length === 130) {
    return Uint8Array.from(Buffer.from(s.slice(2), 'hex'));
  }
  if (/^[0-9a-fA-F]{128}$/.test(s)) {
    return Uint8Array.from(Buffer.from(s, 'hex'));
  }
  try {
    const d = bs58.decode(s);
    if (d.length === 64) return Uint8Array.from(d);
  } catch {
    /* try base64 */
  }
  try {
    const b = Buffer.from(s, 'base64');
    if (b.length === 64) return Uint8Array.from(b);
  } catch {
    /* fall through */
  }
  throw new ValidationError(
    'Invalid sessionSignature — use hex (128 chars), base58, or base64 (64 bytes ed25519)',
  );
}

export function parseFamily(raw: unknown): PayoutAuthFamily {
  const family = String(raw ?? '').toUpperCase();
  if (family === 'EVM' || family === 'SOLANA' || family === 'SUI') return family;
  throw new ValidationError('family must be EVM, SOLANA, or SUI');
}

export function familyPayoutWallet(
  app: {
    payoutWallet: string | null;
    payoutWalletSolana?: string | null;
    payoutWalletSui?: string | null;
  },
  family: PayoutAuthFamily,
): string | null {
  if (family === 'EVM') {
    return app.payoutWallet && isValidAddress(app.payoutWallet) ? app.payoutWallet : null;
  }
  if (family === 'SOLANA') {
    if (app.payoutWalletSolana && isValidSolanaAddress(app.payoutWalletSolana)) {
      return app.payoutWalletSolana;
    }
    if (app.payoutWallet && isValidSolanaAddress(app.payoutWallet)) return app.payoutWallet;
    return null;
  }
  if (app.payoutWalletSui && isValidSuiAddress(app.payoutWalletSui)) return app.payoutWalletSui;
  if (app.payoutWallet && isValidSuiAddress(app.payoutWallet) && !isValidAddress(app.payoutWallet)) {
    return app.payoutWallet;
  }
  return null;
}

export function familyAuth(
  app: {
    payoutAuthSignature: string | null;
    payoutAuthValidUntil: Date | null;
    payoutAuthSolanaSignature?: string | null;
    payoutAuthSolanaValidUntil?: Date | null;
    payoutAuthSuiSignature?: string | null;
    payoutAuthSuiValidUntil?: Date | null;
  },
  family: PayoutAuthFamily,
): { signature: string | null; validUntil: Date | null } {
  if (family === 'EVM') {
    return { signature: app.payoutAuthSignature, validUntil: app.payoutAuthValidUntil };
  }
  if (family === 'SOLANA') {
    return {
      signature: app.payoutAuthSolanaSignature ?? null,
      validUntil: app.payoutAuthSolanaValidUntil ?? null,
    };
  }
  return {
    signature: app.payoutAuthSuiSignature ?? null,
    validUntil: app.payoutAuthSuiValidUntil ?? null,
  };
}

export function requireFamilyAuth(
  app: {
    payoutAuthSignature: string | null;
    payoutAuthValidUntil: Date | null;
    payoutAuthSolanaSignature?: string | null;
    payoutAuthSolanaValidUntil?: Date | null;
    payoutAuthSuiSignature?: string | null;
    payoutAuthSuiValidUntil?: Date | null;
  },
  family: PayoutAuthFamily,
): { signature: string; validUntil: Date } {
  const auth = familyAuth(app, family);
  if (!auth.signature || !auth.validUntil) {
    throw new ValidationError(`Authorize ${family} payouts in app settings first`);
  }
  if (auth.validUntil.getTime() <= Date.now()) {
    throw new ValidationError(`${family} payout authorization has expired — sign again`);
  }
  return { signature: auth.signature, validUntil: auth.validUntil };
}

export async function preparePayoutAuth(merchantId: string, appId: string, family: PayoutAuthFamily) {
  const app = await getApp(merchantId, appId);
  const wallet = familyPayoutWallet(app, family);
  if (!wallet) {
    throw new ValidationError(`Configure a ${family} payout wallet first`);
  }

  const validUntil = BigInt(Math.floor(Date.now() / 1000) + PAYOUT_AUTH_TTL_SEC);

  if (family === 'EVM') {
    const typedData = buildAuthorizePayoutsTypedData({
      merchantWallet: wallet as Address,
      validUntil,
    });
    return {
      family,
      purpose: PAYOUT_AUTH_PURPOSE,
      wallet,
      validUntil: validUntil.toString(),
      typedData: {
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: {
          merchantWallet: typedData.message.merchantWallet,
          purpose: typedData.message.purpose,
          validUntil: validUntil.toString(),
        },
      },
    };
  }

  if (family === 'SOLANA') {
    const merchant = new PublicKey(wallet);
    const purposeMessage = buildSolanaPayoutAuthMessage(merchant, validUntil);
    const legacySessionMessage = buildSolanaSessionMessage(merchant, validUntil);
    return {
      family,
      purpose: PAYOUT_AUTH_PURPOSE,
      wallet,
      validUntil: validUntil.toString(),
      message: purposeMessage.toString('utf8'),
      messageBase64: purposeMessage.toString('base64'),
      legacySessionMessageBase64: legacySessionMessage.toString('base64'),
    };
  }

  const purposeMessage = buildSuiPayoutAuthMessage(wallet, validUntil);
  return {
    family,
    purpose: PAYOUT_AUTH_PURPOSE,
    wallet,
    validUntil: validUntil.toString(),
    message: purposeMessage.toString('utf8'),
    messageBase64: purposeMessage.toString('base64'),
  };
}

export async function attachPayoutAuth(
  merchantId: string,
  appId: string,
  family: PayoutAuthFamily,
  signature: string,
  validUntilRaw: string,
) {
  const app = await getApp(merchantId, appId);
  const wallet = familyPayoutWallet(app, family);
  if (!wallet) {
    throw new ValidationError(`Configure a ${family} payout wallet first`);
  }

  let validUntil: bigint;
  try {
    validUntil = BigInt(validUntilRaw);
  } catch {
    throw new ValidationError('Invalid authorization expiry');
  }
  if (validUntil <= BigInt(Math.floor(Date.now() / 1000))) {
    throw new ValidationError('Authorization expiry is in the past — prepare again');
  }
  const maxUntil = BigInt(Math.floor(Date.now() / 1000) + PAYOUT_AUTH_TTL_SEC + 60);
  if (validUntil > maxUntil) {
    throw new ValidationError('Authorization expiry is too far in the future');
  }

  if (family === 'EVM') {
    const typedData = buildAuthorizePayoutsTypedData({
      merchantWallet: wallet as Address,
      validUntil,
    });
    const recovered = await recoverTypedDataAddress({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
      signature: signature as Hex,
    });
    if (recovered.toLowerCase() !== wallet.toLowerCase()) {
      throw new ValidationError('Payout authorization must be signed by the EVM payout wallet');
    }
  } else if (family === 'SOLANA') {
    const merchant = new PublicKey(wallet);
    const sig = parseEd25519Signature64(signature);
    const purposeOk = verifyEd25519(
      Uint8Array.from(buildSolanaPayoutAuthMessage(merchant, validUntil)),
      sig,
      merchant.toBytes(),
    );
    const sessionOk = verifyEd25519(
      Uint8Array.from(buildSolanaSessionMessage(merchant, validUntil)),
      sig,
      merchant.toBytes(),
    );
    if (!purposeOk && !sessionOk) {
      throw new ValidationError('Payout authorization must be signed by the Solana payout wallet');
    }
  } else {
    const message = buildSuiPayoutAuthMessage(wallet, validUntil);
    try {
      const publicKey = await verifyPersonalMessageSignature(new Uint8Array(message), signature);
      if (publicKey.toSuiAddress().toLowerCase() !== wallet.toLowerCase()) {
        throw new ValidationError('Payout authorization must be signed by the Sui payout wallet');
      }
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError('Payout authorization must be signed by the Sui payout wallet');
    }
  }

  const db = getDatabaseClient();
  const validUntilDate = new Date(Number(validUntil) * 1000);
  const data =
    family === 'EVM'
      ? {
          payoutAuthSignature: signature,
          payoutAuthValidUntil: validUntilDate,
          payoutApproved: true,
        }
      : family === 'SOLANA'
        ? {
            payoutAuthSolanaSignature: signature,
            payoutAuthSolanaValidUntil: validUntilDate,
          }
        : {
            payoutAuthSuiSignature: signature,
            payoutAuthSuiValidUntil: validUntilDate,
          };

  await db.app.update({ where: { id: appId }, data });
  return getApp(merchantId, appId);
}
