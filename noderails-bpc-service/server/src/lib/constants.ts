export class BpcError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(message: string, code: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = 'BpcError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends BpcError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends BpcError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends BpcError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends BpcError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

export class BlockchainError extends BpcError {
  constructor(message: string, details?: unknown) {
    super(message, 'BLOCKCHAIN_ERROR', 502, details);
    this.name = 'BlockchainError';
  }
}

export function isBpcError(err: unknown): err is BpcError {
  return err instanceof BpcError;
}

export const NATIVE_TOKEN_SENTINEL = 'native';
export const EVM_NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000';
export const SOLANA_NATIVE_SENTINEL = '11111111111111111111111111111111';
export const SUI_NATIVE_COIN_TYPE = '0x2::sui::SUI';

export function isNativeToken(contractAddress: string): boolean {
  const t = contractAddress.trim().toLowerCase();
  return (
    t === NATIVE_TOKEN_SENTINEL ||
    t === EVM_NATIVE_ADDRESS.toLowerCase() ||
    t === SOLANA_NATIVE_SENTINEL ||
    t === '0x2::sui::sui'
  );
}

export const CHAIN_COINGECKO_PLATFORMS: Record<number, string> = {
  1: 'ethereum',
  137: 'polygon-pos',
  8453: 'base',
  42161: 'arbitrum-one',
  10: 'optimistic-ethereum',
  103: 'solana',
  203: 'sui',
};

export const AUTH_CONFIG = {
  ACCESS_TOKEN_TTL: '15m' as const,
  REFRESH_TOKEN_TTL: '7d' as const,
  ADMIN_REFRESH_COOKIE_NAME: 'bpc_admin_refresh',
};
