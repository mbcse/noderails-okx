const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8080';

export { API_BASE };

export async function getPaymentIntent(intentId: string) {
  const res = await fetch(`${API_BASE}/payments/intents/${intentId}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

export async function getInvoicePublic(invoiceId: string) {
  const res = await fetch(`${API_BASE}/invoices/public/${invoiceId}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

export async function getPaymentLinkBySlug(slug: string) {
  const res = await fetch(`${API_BASE}/payment-links/public/${slug}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

// ── Checkout Sessions ──

/**
 * Create a checkout session from a payment link slug.
 * This is the primary entry point — the payment-ui calls this when a
 * customer visits a payment link URL.
 *
 * Returns: session data + resolved chains/tokens + display info.
 */
export async function createCheckoutSessionFromLink(slug: string) {
  const res = await fetch(`${API_BASE}/checkout-sessions/from-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

/**
 * Create a checkout session from an invoice ID.
 * Called by payment-ui when a customer clicks "Pay Invoice".
 *
 * Returns: session data + resolved chains/tokens + invoice display info.
 */
export async function createCheckoutSessionFromInvoice(invoiceId: string) {
  const res = await fetch(`${API_BASE}/checkout-sessions/from-invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId }),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

/**
 * Load a checkout session for the payment UI (with resolved chains/tokens).
 */
export type CheckoutSessionLoadResult =
  | { error: string }
  | (Record<string, unknown> & { error?: never });

export async function getCheckoutSession(sessionId: string): Promise<CheckoutSessionLoadResult | null> {
  const res = await fetch(`${API_BASE}/checkout-sessions/public/${sessionId}`, {
    cache: 'no-store',
  });
  let json: { data?: unknown; error?: { message?: string }; message?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const message =
      json?.error?.message ?? json?.message ?? 'This checkout session is unavailable.';
    return { error: message };
  }
  if (!json) return null;
  return (json.data ?? json) as Record<string, unknown>;
}

// ── Prices (proxied via noderails-server → BPC) ──

export interface PriceQuery {
  asset: string;
  currency?: string;
  amountFiat?: number;
  tokenAmount?: number;
  dstAsset?: string;
  quote?: 'swap';
  checkoutSessionId?: string;
}

export interface PriceResult {
  asset: string;
  symbol: string;
  currency: string;
  priceFiat: number;
  priceUsd: number;
  cachedAt: string;
  stale?: boolean;
  amountFiat?: number;
  tokenAmount?: string;
  quoteId?: string;
  cryptoAmount?: string;
  minAmountOut?: string;
  expiresAt?: string;
  ttlSeconds?: number;
}

export async function getPrice(params: PriceQuery): Promise<PriceResult> {
  const search = new URLSearchParams({ asset: params.asset });
  if (params.currency) search.set('currency', params.currency);
  if (params.amountFiat !== undefined) search.set('amountFiat', String(params.amountFiat));
  if (params.tokenAmount !== undefined) search.set('tokenAmount', String(params.tokenAmount));
  if (params.dstAsset) search.set('dstAsset', params.dstAsset);
  if (params.quote) search.set('quote', params.quote);
  if (params.checkoutSessionId) search.set('checkoutSessionId', params.checkoutSessionId);

  const res = await fetch(`${API_BASE}/prices?${search.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch price for ${params.asset}`);
  const json = await res.json();
  return json.data ?? json;
}

/** @deprecated Use getPrice({ asset: symbol }) */
export async function getTokenPrice(symbol: string, currency = 'USD'): Promise<PriceResult> {
  return getPrice({ asset: symbol, currency });
}

/** @deprecated Use getPrice({ asset, amountFiat, currency }) */
export async function convertFiatToToken(
  asset: string,
  amountFiat: number,
  currency = 'USD',
): Promise<PriceResult & { amountFiat: number; tokenAmount: string }> {
  const result = await getPrice({ asset, currency, amountFiat });
  if (!result.tokenAmount) {
    throw new Error(`No token amount returned for ${asset}`);
  }
  return {
    ...result,
    amountFiat,
    tokenAmount: result.tokenAmount,
  };
}

/** @deprecated Use getPrice with amountFiat */
export const convertUsdToToken = (asset: string, amountUsd: number) =>
  convertFiatToToken(asset, amountUsd, 'USD');

// ── Balances (proxied via noderails-server → BPC) ──

export interface WalletBalanceResult {
  chainId: number;
  address: string;
  balanceRaw: string;
  balanceFormatted: string;
  decimals: number;
  symbol: string;
  fetchedAt: string;
  price?: {
    unitPrice: number;
    totalValue: string;
    currency: string;
  };
}

export interface WalletBalanceQuery {
  chainId: number;
  address: string;
  token?: string;
  tokenKey?: string;
  includePrice?: boolean;
  currency?: string;
}

export async function getWalletBalance(query: WalletBalanceQuery): Promise<WalletBalanceResult> {
  const search = new URLSearchParams({
    chainId: String(query.chainId),
    address: query.address,
  });
  if (query.token) search.set('token', query.token);
  if (query.tokenKey) search.set('tokenKey', query.tokenKey);
  if (query.includePrice) search.set('includePrice', 'true');
  if (query.currency) search.set('currency', query.currency);

  const res = await fetch(`${API_BASE}/balance?${search.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch wallet balance');
  const json = await res.json();
  return json.data ?? json;
}

export async function refreshWalletBalanceBatch(
  items: Array<{ chainId: number; address: string; token?: string; tokenKey?: string }>,
  includePrice = false,
  currency = 'USD',
): Promise<WalletBalanceResult[]> {
  const res = await fetch(`${API_BASE}/balance/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, includePrice, currency }),
  });
  if (!res.ok) throw new Error('Failed to fetch wallet balances');
  const json = await res.json();
  return json.data ?? json;
}

// ── Checkout / Authorization ──

export interface AuthorizePaymentInput {
  /** Primary: authorize via a checkout session (universal path) */
  checkoutSessionId?: string;
  /** Legacy: authorize directly from a payment link */
  paymentLinkId?: string;
  walletAddress: string;
  chainId: number;
  tokenKey: string;
  authorizationMethod: 'NATIVE' | 'PERMIT';
  permitSignature?: {
    amount: string;
    deadline: string;
    v: number;
    r: string;
    s: string;
  };
  approvalTxHash?: string;
  cryptoAmount: string;
  exchangeRate: string;
  quoteId?: string;
  /** Customer email — required for all checkout sessions */
  customerEmail: string;
  /** Customer name */
  customerName?: string;
  /** Billing address fields */
  billingAddress?: string;
  billingCity?: string;
  billingState?: string;
  billingCountry?: string;
  billingPostalCode?: string;
}

export async function authorizePayment(input: AuthorizePaymentInput): Promise<{
  intentId: string;
  status: string;
  transactionId?: string;
  /** Returned for native tokens — frontend must send this tx from the user's wallet */
  captureData?:
    | {
        to: string;
        data: string;
        value: string;
        chainId: number;
      }
      | {
        chainType: 'SOLANA';
        chainId: number;
        /** Ed25519 program verify ix — must appear before `instruction` in the same tx */
        preInstructions?: Array<{
          programId: string;
          keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
          data: string;
        }>;
        instruction: {
          programId: string;
          keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
          data: string;
        };
      }
    | {
        chainType: 'SUI';
        chainId: number;
        packageId: string;
        configObjectId: string;
        registryObjectId: string;
        coinType: string;
        paymentIntentIdHex: string;
        merchantAddress: string;
        amount: string;
        feeBps: number;
        timelocksHex: string;
        platformPublicKeyBase64: string;
        platformSignatureBase64: string;
        sponsored?: boolean;
        mtxmChainId?: string;
        transactionBlockBase64?: string;
        sponsorSignature?: string;
        dualSignRequired?: boolean;
      };
}> {
  const res = await fetch(`${API_BASE}/checkout/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `Authorization failed (${res.status})`);
  }
  const json = await res.json();
  return json.data ?? json;
}

// ── Native Capture Reporting ──

/**
 * Report a native token capture transaction sent by the user.
 * Called after the user sends the tx from their wallet.
 */
export async function reportNativeCapture(intentId: string, txHash: string): Promise<{
  transactionId: string;
}> {
  const res = await fetch(`${API_BASE}/checkout/report-native-capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intentId, txHash }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `Failed to report native capture (${res.status})`);
  }
  const json = await res.json();
  return json.data ?? json;
}

// ── Intent Status Polling ──

export async function getCheckoutIntentStatus(intentId: string): Promise<{
  id: string;
  status: string;
  amount: string;
  currency: string;
  successUrl?: string;
  cancelUrl?: string;
}> {
  const res = await fetch(`${API_BASE}/checkout/intent/${intentId}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch intent status');
  const json = await res.json();
  return json.data ?? json;
}

// ── Dispute Portal ──

export async function getDisputeWindow(paymentIntentId: string) {
  const res = await fetch(`${API_BASE}/disputes/customer/window/${paymentIntentId}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

export async function sendCustomerOtp(email: string) {
  const res = await fetch(`${API_BASE}/disputes/customer/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to send OTP');
  return json.data ?? json;
}

export async function verifyCustomerOtp(email: string, code: string) {
  const res = await fetch(`${API_BASE}/disputes/customer/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, code }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Invalid OTP');
  return json.data ?? json;
}

export async function getCustomerPayments() {
  const res = await fetch(`${API_BASE}/disputes/customer/payments`, {
    credentials: 'include',
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load payments');
  return json.data ?? json;
}

export async function raiseDispute(
  paymentIntentId: string,
  reason: string,
  proofFile?: File,
) {
  const formData = new FormData();
  formData.append('paymentIntentId', paymentIntentId);
  formData.append('reason', reason);
  if (proofFile) formData.append('proof', proofFile);

  const res = await fetch(`${API_BASE}/disputes/customer/raise`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to raise dispute');
  return json.data ?? json;
}

export async function downloadReceipt(paymentIntentId: string) {
  const res = await fetch(`${API_BASE}/disputes/customer/receipt/${paymentIntentId}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to download receipt');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipt-${paymentIntentId.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
