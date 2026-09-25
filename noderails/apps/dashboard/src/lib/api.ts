function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8080';
  if (typeof window === 'undefined') return configured;
  try {
    const api = new URL(configured, window.location.origin);
    if (api.hostname === 'localhost' || api.hostname === '127.0.0.1') {
      return '/nr-api';
    }
  } catch {
    /* keep configured */
  }
  return configured;
}

const API_BASE = resolveApiBase();

export const SESSION_EXPIRED_MESSAGE = 'Please sign in again.';
const API_DOWN_MESSAGE =
  'Maintenance underway. We will be right back, please try again later.';

type DashboardSessionKind = 'merchant' | 'team';

let sessionToken: string | null = null;
let sessionKind: DashboardSessionKind | null = null;
let refreshInFlight: Promise<string | null> | null = null;
const sessionListeners = new Set<(token: string | null) => void>();

export function syncDashboardSession(token: string | null, kind: DashboardSessionKind | null) {
  sessionToken = token;
  sessionKind = kind;
}

export function subscribeDashboardSession(listener: (token: string | null) => void) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

function notifyDashboardSession(token: string | null) {
  for (const listener of sessionListeners) listener(token);
}

function isAuthBoundaryPath(path: string) {
  return (
    path === '/auth/login' ||
    path === '/auth/register' ||
    path === '/auth/refresh' ||
    path === '/auth/forgot-password' ||
    path === '/auth/reset-password' ||
    path === '/team/refresh' ||
    path === '/team/accept-invite'
  );
}

function throwIfApiDown(err: unknown): never {
  const message = err instanceof Error ? err.message : '';
  if (
    err instanceof TypeError ||
    /failed to fetch|load failed|networkerror|fetch failed/i.test(message)
  ) {
    throw new Error(API_DOWN_MESSAGE);
  }
  throw err instanceof Error ? err : new Error(message || 'Request failed');
}

async function postRefresh<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    throwIfApiDown(err);
  }
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Request failed: ${res.status}`);
  }
  return (json.data ?? json) as T;
}

export async function refreshDashboardAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      if (sessionKind === 'team') {
        const result = await postRefresh<{ accessToken: string }>('/team/refresh');
        sessionToken = result.accessToken;
        notifyDashboardSession(result.accessToken);
        return result.accessToken;
      }

      try {
        const result = await postRefresh<{ accessToken: string }>('/auth/refresh');
        sessionToken = result.accessToken;
        if (!sessionKind) sessionKind = 'merchant';
        notifyDashboardSession(result.accessToken);
        return result.accessToken;
      } catch (err) {
        if (sessionKind === 'merchant') throw err;
        const result = await postRefresh<{ accessToken: string }>('/team/refresh');
        sessionToken = result.accessToken;
        sessionKind = 'team';
        notifyDashboardSession(result.accessToken);
        return result.accessToken;
      }
    } catch {
      sessionToken = null;
      sessionKind = null;
      notifyDashboardSession(null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  import('posthog-js').then(({ default: posthog }) => {
    posthog.capture(event, properties);
  });
}

interface FetchOptions extends RequestInit {
  token?: string;
  _retried?: boolean;
}

async function request(path: string, opts: FetchOptions = {}): Promise<Response> {
  const { token, headers: extraHeaders, _retried, ...rest } = opts;
  const bearer = sessionToken ?? token ?? undefined;

  const headers: Record<string, string> = {
    ...((extraHeaders as Record<string, string>) ?? {}),
  };

  const isFormData = typeof FormData !== 'undefined' && rest.body instanceof FormData;
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (bearer) {
    headers['Authorization'] = `Bearer ${bearer}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers,
      ...rest,
    });
  } catch (err) {
    throwIfApiDown(err);
  }

  if (res.status === 401 && !_retried && !isAuthBoundaryPath(path) && Boolean(bearer)) {
    const next = await refreshDashboardAccessToken();
    if (next) {
      return request(path, { ...opts, token: next, _retried: true });
    }
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  return res;
}

async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const res = await request(path, opts);

  // 204 No Content - nothing to parse
  if (res.status === 204) return undefined as T;

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error?.message ?? `Request failed: ${res.status}`);
  }

  // For paginated responses, return { items, total, page, pageSize, totalPages, hasMore }
  if (json.pagination) {
    return {
      items: json.data ?? [],
      ...json.pagination,
      hasMore: json.pagination.page < json.pagination.totalPages,
    } as T;
  }

  return json.data ?? json;
}

// ── Public (no auth) ──

export async function getChainRegistry() {
  return apiFetch<{ chains: import('@noderails/common').MergedChainRegistryEntry[]; updatedAt: string }>(
    '/public/chain-registry',
  );
}

export async function getPrice(params: {
  asset: string;
  currency?: string;
  amountFiat?: number;
  tokenAmount?: number;
}) {
  const search = new URLSearchParams({ asset: params.asset });
  if (params.currency) search.set('currency', params.currency);
  if (params.amountFiat !== undefined) search.set('amountFiat', String(params.amountFiat));
  if (params.tokenAmount !== undefined) search.set('tokenAmount', String(params.tokenAmount));
  return apiFetch<{
    asset: string;
    symbol: string;
    currency: string;
    priceFiat: number;
    cachedAt: string;
    amountFiat?: number;
    tokenAmount?: string;
  }>(`/prices?${search.toString()}`);
}

export async function getWalletBalance(params: {
  chainId: number;
  address: string;
  token?: string;
  tokenKey?: string;
  includePrice?: boolean;
  currency?: string;
}) {
  const search = new URLSearchParams({
    chainId: String(params.chainId),
    address: params.address,
  });
  if (params.token) search.set('token', params.token);
  if (params.tokenKey) search.set('tokenKey', params.tokenKey);
  if (params.includePrice) search.set('includePrice', 'true');
  if (params.currency) search.set('currency', params.currency);
  return apiFetch<{
    chainId: number;
    address: string;
    balanceRaw: string;
    balanceFormatted: string;
    decimals: number;
    symbol: string;
    fetchedAt: string;
  }>(`/balance?${search.toString()}`);
}

export async function getWalletBalancesBatch(
  items: Array<{ chainId: number; address: string; token?: string; tokenKey?: string }>,
  includePrice = false,
  currency = 'USD',
) {
  return apiFetch<Array<{
    chainId: number;
    address: string;
    balanceRaw: string;
    balanceFormatted: string;
    decimals: number;
    symbol: string;
    fetchedAt: string;
  }>>('/balance/batch', {
    method: 'POST',
    body: JSON.stringify({ items, includePrice, currency }),
  });
}

// ── Auth ──

export async function login(email: string, password: string) {
  return apiFetch<{ merchant?: any; member?: any; accessToken: string; isTeamMember?: boolean }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string) {
  return apiFetch<{ merchant: any; accessToken: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function refreshToken() {
  return apiFetch<{ accessToken: string }>('/auth/refresh', { method: 'POST' });
}

export async function getProfile(token: string) {
  return apiFetch<any>('/auth/me', { token });
}

export async function logout() {
  return apiFetch('/auth/logout', { method: 'POST' });
}

export async function updateProfile(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/auth/me', { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function sendOtp(token: string) {
  return apiFetch<{ expiresAt: string }>('/auth/send-otp', { token, method: 'POST' });
}

export async function verifyOtp(token: string, code: string) {
  return apiFetch<{ verified: boolean }>('/auth/verify-otp', {
    token,
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function requestPasswordReset(email: string) {
  return apiFetch<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string) {
  return apiFetch<{ reset: boolean }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

// ── Apps ──

export async function getApps(token: string) {
  return apiFetch<any[]>('/apps', { token });
}

export async function getApp(token: string, appId: string) {
  return apiFetch<any>(`/apps/${appId}`, { token });
}

export async function createApp(token: string, data: { name: string; environment?: string }) {
  const result = await apiFetch<any>('/apps', { token, method: 'POST', body: JSON.stringify(data) });
  track('dashboard_app_created', {
    environment: data.environment ?? 'PRODUCTION',
    app_id: result?.id,
  });
  return result;
}

export async function updateApp(token: string, appId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/apps/${appId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

// ── App Chains ──

export async function getAppChains(token: string, appId: string) {
  return apiFetch<any[]>(`/apps/${appId}/chains`, { token });
}

export async function enableAppChain(token: string, appId: string, chainId: string) {
  return apiFetch<any>(`/apps/${appId}/chains/${chainId}`, { token, method: 'POST' });
}

export async function disableAppChain(token: string, appId: string, chainId: string) {
  return apiFetch<any>(`/apps/${appId}/chains/${chainId}`, { token, method: 'DELETE' });
}

export async function updateAppChainSettlement(
  token: string,
  appId: string,
  chainId: string,
  settlementAddress: string | null,
) {
  return apiFetch<any>(`/apps/${appId}/chains/${chainId}/settlement`, {
    token,
    method: 'PATCH',
    body: JSON.stringify({ settlementAddress }),
  });
}

// ── App Tokens ──

export async function getAppTokens(token: string, appId: string) {
  return apiFetch<any[]>(`/apps/${appId}/tokens`, { token });
}

export async function enableAppToken(token: string, appId: string, tokenId: string) {
  return apiFetch<any>(`/apps/${appId}/tokens/${tokenId}`, { token, method: 'POST' });
}

export async function disableAppToken(token: string, appId: string, tokenId: string) {
  return apiFetch<any>(`/apps/${appId}/tokens/${tokenId}`, { token, method: 'DELETE' });
}

// ── Available Chains & Tokens ──

export async function getAvailableChains(token: string, environment?: 'TEST' | 'PRODUCTION') {
  const params = environment ? `?environment=${environment}` : '';
  return apiFetch<any[]>(`/apps/available-chains${params}`, { token });
}

export async function getAvailableTokens(token: string, environment?: 'TEST' | 'PRODUCTION') {
  const params = environment ? `?environment=${environment}` : '';
  return apiFetch<any[]>(`/apps/available-tokens${params}`, { token });
}

export async function getAvailableCurrencies(token: string) {
  return apiFetch<any[]>(`/apps/available-currencies`, { token });
}

export async function getSettlementConfig(token: string, appId: string) {
  return apiFetch<any>(`/apps/${appId}/settlement-config`, { token });
}

export async function updateSettlementConfig(token: string, appId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/apps/${appId}/settlement-config`, {
    token,
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getSettlementBalance(token: string, appId: string) {
  return apiFetch<{
    balance: string;
    chainId: number | null;
    tokenKey: string | null;
    merchant: string | null;
    escrow: string | null;
    tokenAddress?: string;
    bankAuthValidUntil?: string | null;
    bankAuthActive?: boolean;
  }>(`/apps/${appId}/settlement-balance`, { token });
}

export async function prepareBankSettlementAuth(token: string, appId: string) {
  return apiFetch<{
    typedData: {
      domain: Record<string, unknown>;
      types: Record<string, { name: string; type: string }[]>;
      primaryType: string;
      message: { merchantWallet: string; purpose: string; validUntil: string };
    };
    validUntil: string;
    merchant: string;
  }>(
    `/apps/${appId}/bank-settlement-auth/prepare`,
    { token, method: 'POST' },
  );
}

export async function attachBankSettlementAuth(
  token: string,
  appId: string,
  merchantSignature: string,
  validUntil: string,
) {
  return apiFetch<any>(`/apps/${appId}/bank-settlement-auth`, {
    token,
    method: 'POST',
    body: JSON.stringify({ merchantSignature, validUntil }),
  });
}

export async function createBankSettlement(token: string, appId: string) {
  return apiFetch<any>(`/apps/${appId}/bank-settlements`, { token, method: 'POST' });
}

export async function listBankSettlements(token: string, appId: string) {
  return apiFetch<any[]>(`/apps/${appId}/bank-settlements`, { token });
}

export async function createBankBeneficiary(token: string, appId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/apps/${appId}/bank-beneficiaries`, {
    token,
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function prepareSettlementWithdraw(token: string, appId: string, destination: string) {
  return apiFetch<any>(`/apps/${appId}/settlement-withdrawals/prepare`, {
    token,
    method: 'POST',
    body: JSON.stringify({ destination }),
  });
}

export async function executeSettlementWithdraw(token: string, appId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/apps/${appId}/settlement-withdrawals/execute`, {
    token,
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── API Keys ──

export async function getApiKeys(token: string, appId: string) {
  return apiFetch<any[]>(`/apps/${appId}/api-keys`, { token });
}

export async function createApiKey(token: string, appId: string, data: { name?: string; type: 'PUBLIC' | 'SECRET' }) {
  return apiFetch<any>(`/apps/${appId}/api-keys`, { token, method: 'POST', body: JSON.stringify(data) });
}

export async function revokeApiKey(token: string, appId: string, keyId: string) {
  return apiFetch<void>(`/apps/${appId}/api-keys/${keyId}`, { token, method: 'DELETE' });
}

// ── Payments ──

export async function getPayments(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/payments/intents${qs}`, { token });
}

export async function getPayment(token: string, id: string) {
  return apiFetch<any>(`/payments/intents/${id}`, { token });
}

export async function refundPayment(
  token: string,
  id: string,
  reason: string,
  opts?: { amount?: string; percent?: number },
) {
  return apiFetch<any>(`/payments/intents/${id}/refund`, {
    token,
    method: 'POST',
    body: JSON.stringify({
      reason,
      ...(opts?.amount ? { amount: opts.amount } : {}),
      ...(opts?.percent != null ? { percent: opts.percent } : {}),
    }),
  });
}

// ── Payouts ──

export async function getPayouts(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/payouts${qs}`, { token });
}

export async function getPayout(token: string, payoutId: string) {
  return apiFetch<any>(`/payouts/${payoutId}`, { token });
}

export async function createPayout(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/payouts', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function executePayout(token: string, payoutId: string, data: Record<string, unknown> = {}) {
  return apiFetch<any>(`/payouts/${payoutId}/execute`, {
    token,
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function cancelPayout(token: string, payoutId: string) {
  return apiFetch<any>(`/payouts/${payoutId}/cancel`, { token, method: 'POST', body: '{}' });
}

export async function getPayoutFunding(token: string, appId: string, chainId: string) {
  return apiFetch<any>(`/apps/${appId}/payout-funding?chainId=${encodeURIComponent(chainId)}`, { token });
}

export async function getPayoutSchedules(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/payout-schedules${qs}`, { token });
}

export async function createPayoutSchedule(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/payout-schedules', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function pausePayoutSchedule(token: string, id: string) {
  return apiFetch<any>(`/payout-schedules/${id}/pause`, { token, method: 'POST', body: '{}' });
}

export async function resumePayoutSchedule(token: string, id: string) {
  return apiFetch<any>(`/payout-schedules/${id}/resume`, { token, method: 'POST', body: '{}' });
}

export async function cancelPayoutSchedule(token: string, id: string) {
  return apiFetch<any>(`/payout-schedules/${id}/cancel`, { token, method: 'POST', body: '{}' });
}

export async function getPayoutContacts(token: string, appId: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/apps/${appId}/payout-contacts${qs}`, { token });
}

export async function createPayoutContact(token: string, appId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/apps/${appId}/payout-contacts`, {
    token,
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePayoutContact(
  token: string,
  appId: string,
  contactId: string,
  data: Record<string, unknown>,
) {
  return apiFetch<any>(`/apps/${appId}/payout-contacts/${contactId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deletePayoutContact(token: string, appId: string, contactId: string) {
  return apiFetch<any>(`/apps/${appId}/payout-contacts/${contactId}`, { token, method: 'DELETE' });
}

export async function importPayoutCsv(token: string, appId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/apps/${appId}/payout-contacts/import`, {
    token,
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function preparePayoutAuth(
  token: string,
  appId: string,
  family: 'EVM' | 'SOLANA' | 'SUI',
) {
  return apiFetch<{
    family: 'EVM' | 'SOLANA' | 'SUI';
    purpose: string;
    wallet: string;
    validUntil: string;
    typedData?: {
      domain: Record<string, unknown>;
      types: Record<string, { name: string; type: string }[]>;
      primaryType: string;
      message: { merchantWallet: string; purpose: string; validUntil: string };
    };
    message?: string;
    messageBase64?: string;
    legacySessionMessageBase64?: string;
  }>(`/apps/${appId}/payout-auth/prepare`, {
    token,
    method: 'POST',
    body: JSON.stringify({ family }),
  });
}

export async function attachPayoutAuth(
  token: string,
  appId: string,
  data: { family: 'EVM' | 'SOLANA' | 'SUI'; signature: string; validUntil: string },
) {
  return apiFetch<any>(`/apps/${appId}/payout-auth`, {
    token,
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Subscriptions ──

export async function getSubscriptions(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/subscriptions${qs}`, { token });
}

export async function createSubscription(token: string, data: Record<string, unknown>) {
  const result = await apiFetch<any>('/subscriptions', { token, method: 'POST', body: JSON.stringify(data) });
  track('dashboard_subscription_created', {
    subscription_id: result?.id,
  });
  return result;
}

export async function getSubscription(token: string, id: string) {
  return apiFetch<any>(`/subscriptions/${id}`, { token });
}

export async function pauseSubscription(token: string, id: string) {
  return apiFetch<any>(`/subscriptions/${id}/pause`, { token, method: 'POST' });
}

export async function resumeSubscription(token: string, id: string) {
  return apiFetch<any>(`/subscriptions/${id}/resume`, { token, method: 'POST' });
}

export async function cancelSubscription(token: string, id: string, cancelAtPeriodEnd = false) {
  return apiFetch<any>(`/subscriptions/${id}/cancel`, {
    token,
    method: 'POST',
    body: JSON.stringify({ cancelAtPeriodEnd }),
  });
}

export async function createSubscriptionCheckout(token: string, subscriptionId: string) {
  return apiFetch<any>(`/subscriptions/${subscriptionId}/checkout`, { token, method: 'POST' });
}

// ── Invoices ──

export async function getInvoices(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/invoices${qs}`, { token });
}

export async function createInvoice(token: string, data: Record<string, unknown>) {
  const result = await apiFetch<any>('/invoices', { token, method: 'POST', body: JSON.stringify(data) });
  track('dashboard_invoice_created', {
    invoice_id: result?.id,
  });
  return result;
}

export async function getInvoice(token: string, id: string) {
  return apiFetch<any>(`/invoices/${id}`, { token });
}

export async function openInvoice(token: string, id: string) {
  return apiFetch<any>(`/invoices/${id}/open`, { token, method: 'POST' });
}

export async function voidInvoice(token: string, id: string) {
  return apiFetch<any>(`/invoices/${id}/void`, { token, method: 'POST' });
}

export async function sendInvoiceEmail(token: string, id: string) {
  return apiFetch<{ sent: boolean }>(`/invoices/${id}/send`, { token, method: 'POST' });
}

// ── Prices ──

export async function getPrices(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/prices${qs}`);
}

// ── Product Plans ──

export async function getProductPlans(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/product-plans${qs}`, { token });
}

export async function createProductPlan(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/product-plans', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function getProductPlan(token: string, planId: string) {
  return apiFetch<any>(`/product-plans/${planId}`, { token });
}

export async function updateProductPlan(token: string, planId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/product-plans/${planId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function addProductPlanPrice(token: string, planId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/product-plans/${planId}/prices`, { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateProductPlanPrice(token: string, planId: string, priceId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/product-plans/${planId}/prices/${priceId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function deactivateProductPlanPrice(token: string, planId: string, priceId: string) {
  return apiFetch<any>(`/product-plans/${planId}/prices/${priceId}`, { token, method: 'DELETE' });
}

// ── Customer Accounts ──

export async function getCustomers(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/customers${qs}`, { token });
}

export async function createCustomer(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/customers', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function getCustomer(token: string, customerId: string) {
  return apiFetch<any>(`/customers/${customerId}`, { token });
}

export async function updateCustomer(token: string, customerId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/customers/${customerId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

// ── Checkout Sessions ──

export async function getCheckoutSessions(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/checkout-sessions${qs}`, { token });
}

export async function createCheckoutSession(token: string, data: Record<string, unknown>) {
  const result = await apiFetch<any>('/checkout-sessions', { token, method: 'POST', body: JSON.stringify(data) });
  track('dashboard_checkout_session_created', {
    checkout_session_id: result?.id,
  });
  return result;
}

// ── Payment Links ──

export async function getPaymentLinks(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/payment-links${qs}`, { token });
}

export async function createPaymentLink(token: string, data: Record<string, unknown>) {
  const result = await apiFetch<any>('/payment-links', { token, method: 'POST', body: JSON.stringify(data) });
  track('dashboard_payment_link_created', {
    payment_link_id: result?.id,
  });
  return result;
}

export async function getPaymentLink(token: string, id: string) {
  return apiFetch<any>(`/payment-links/${id}`, { token });
}

export async function updatePaymentLink(token: string, id: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/payment-links/${id}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function deletePaymentLink(token: string, id: string) {
  return apiFetch<any>(`/payment-links/${id}`, { token, method: 'DELETE' });
}

// ── Webhooks ──

export async function getWebhooks(token: string, appId: string) {
  return apiFetch<any[]>(`/apps/${appId}/webhooks`, { token });
}

export async function createWebhook(token: string, appId: string, data: { url: string; events: string[] }) {
  return apiFetch<any>(`/apps/${appId}/webhooks`, { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateWebhook(token: string, appId: string, webhookId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/apps/${appId}/webhooks/${webhookId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteWebhook(token: string, appId: string, webhookId: string) {
  return apiFetch<any>(`/apps/${appId}/webhooks/${webhookId}`, { token, method: 'DELETE' });
}

export async function rotateWebhookSecret(token: string, appId: string, webhookId: string) {
  return apiFetch<any>(`/apps/${appId}/webhooks/${webhookId}/rotate-secret`, { token, method: 'POST' });
}

export async function testPingWebhook(token: string, appId: string, webhookId: string) {
  return apiFetch<{ success: boolean; statusCode: number | null; responseBody: string | null; error: string | null }>(
    `/apps/${appId}/webhooks/${webhookId}/test-ping`, { token, method: 'POST' },
  );
}

export async function getWebhookDeliveries(
  token: string,
  appId: string,
  webhookId: string,
  params?: { status?: string; cursor?: string; limit?: number },
) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<{ items: any[]; nextCursor: string | null }>(
    `/apps/${appId}/webhooks/${webhookId}/deliveries${query}`, { token },
  );
}

// ── Stats ──

export async function getStats(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/stats${qs}`, { token });
}

// ── Tax Rates ──

export async function getTaxRates(token: string, includeInactive = false) {
  const params = includeInactive ? '?includeInactive=true' : '';
  return apiFetch<any[]>(`/tax-rates${params}`, { token });
}

export async function createTaxRate(token: string, data: {
  displayName: string;
  percentage: number;
  inclusive?: boolean;
  jurisdiction?: string;
  description?: string;
}) {
  return apiFetch<any>('/tax-rates', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function getTaxRate(token: string, id: string) {
  return apiFetch<any>(`/tax-rates/${id}`, { token });
}

export async function updateTaxRate(token: string, id: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/tax-rates/${id}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function archiveTaxRate(token: string, id: string) {
  return apiFetch<any>(`/tax-rates/${id}`, { token, method: 'DELETE' });
}

// ── Disputes (merchant) ──

export async function getMerchantDisputes(
  token: string,
  params: { appId?: string; status?: string; page?: number; pageSize?: number } = {},
) {
  const query = new URLSearchParams();
  if (params.appId) query.set('appId', params.appId);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiFetch<any>(`/disputes/merchant${qs}`, { token });
}

export async function getMerchantDispute(token: string, disputeId: string) {
  return apiFetch<any>(`/disputes/merchant/${disputeId}`, { token });
}

export async function respondToDispute(
  token: string,
  disputeId: string,
  response: string,
  proofFile?: File,
) {
  const formData = new FormData();
  formData.append('response', response);
  if (proofFile) formData.append('proof', proofFile);

  const res = await request(`/disputes/merchant/${disputeId}/respond`, {
    token,
    method: 'POST',
    body: formData,
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? `Request failed: ${res.status}`);
  return json.data ?? json;
}

// ── Team Members ──

export async function listTeamMembers(token: string) {
  return apiFetch<any[]>('/team', { token });
}

export async function addTeamMember(
  token: string,
  data: { email: string; name?: string; permissions: string[]; allAppsAccess: boolean; appIds?: string[] },
) {
  const result = await apiFetch<any>('/team', { token, method: 'POST', body: JSON.stringify(data) });
  track('dashboard_team_invite_sent', {
    permissions_count: data.permissions.length,
    all_apps_access: data.allAppsAccess,
  });
  return result;
}

export async function updateTeamMember(
  token: string,
  memberId: string,
  data: { name?: string; permissions?: string[]; allAppsAccess?: boolean; appIds?: string[] },
) {
  return apiFetch<any>(`/team/${memberId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function removeTeamMember(token: string, memberId: string) {
  return apiFetch<void>(`/team/${memberId}`, { token, method: 'DELETE' });
}

export async function resendTeamInvite(token: string, memberId: string) {
  const result = await apiFetch<any>(`/team/${memberId}/resend-invite`, { token, method: 'POST' });
  track('dashboard_team_invite_resent');
  return result;
}

// ── Team Member Auth ──

export async function teamRefreshToken() {
  const data = await apiFetch<{ accessToken: string }>('/team/refresh', { method: 'POST' });
  // Decode the access token payload (base64)
  const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
  return {
    accessToken: data.accessToken,
    member: {
      id: payload.sub,
      email: payload.email,
      permissions: payload.permissions ?? [],
      allAppsAccess: payload.allAppsAccess ?? false,
      appIds: payload.appIds ?? [],
      merchantId: payload.merchantId,
      orgName: payload.orgName ?? null,
    },
  };
}

export async function teamLogout() {
  return apiFetch('/team/logout', { method: 'POST' });
}

export async function getInviteInfo(inviteToken: string) {
  return apiFetch<{ email: string; name: string | null; permissions: string[]; orgName: string | null }>(`/team/invite?token=${encodeURIComponent(inviteToken)}`);
}

export async function acceptInvite(inviteToken: string, password: string) {
  return apiFetch<{ member: any; accessToken: string }>('/team/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ inviteToken, password }),
  });
}

// ── Bank (org-level) ──

export async function getBankHub(token: string, environment: 'TEST' | 'PRODUCTION') {
  return apiFetch<any>(`/fiat/hub?environment=${environment}`, { token, cache: 'no-store' });
}

export async function getBankCorridors(token: string) {
  return apiFetch<any>('/fiat/corridors', { token });
}

export async function setBankAccountType(
  token: string,
  environment: 'TEST' | 'PRODUCTION',
  accountType: 'INDIVIDUAL' | 'BUSINESS',
) {
  return apiFetch<any>('/fiat/account-type', {
    token,
    method: 'POST',
    body: JSON.stringify({ environment, accountType }),
  });
}

const BANK_IDENTITY_MAINTENANCE = 'Down for maintenance. Check back later.';

function remapBankIdentityError(err: unknown): never {
  const raw = err instanceof Error ? err.message : '';
  if (/pay for a country first|only available in TEST|start identity after you pay/i.test(raw)) {
    throw err instanceof Error ? err : new Error(raw);
  }
  if (raw === SESSION_EXPIRED_MESSAGE || raw === API_DOWN_MESSAGE) {
    throw err instanceof Error ? err : new Error(raw);
  }
  throw new Error(BANK_IDENTITY_MAINTENANCE);
}

export async function startBankIdentity(token: string, environment: 'TEST' | 'PRODUCTION') {
  try {
    return await apiFetch<any>('/fiat/identity/start', {
      token,
      method: 'POST',
      body: JSON.stringify({ environment }),
    });
  } catch (err) {
    remapBankIdentityError(err);
  }
}

export async function refreshBankIdentity(token: string, environment: 'TEST' | 'PRODUCTION') {
  return apiFetch<any>('/fiat/identity/refresh', {
    token,
    method: 'POST',
    body: JSON.stringify({ environment }),
  });
}

export async function saveOwnAccountDetails(
  token: string,
  environment: 'TEST' | 'PRODUCTION',
  corridor: Record<string, unknown>,
) {
  return apiFetch<any>('/fiat/own-account', {
    token,
    method: 'PUT',
    body: JSON.stringify({ environment, corridor }),
  });
}

export async function uploadOwnAccountStatement(
  token: string,
  environment: 'TEST' | 'PRODUCTION',
  file: File,
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('environment', environment);
  const res = await request('/fiat/own-account/statement', {
    token,
    method: 'POST',
    body: formData,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? `Request failed: ${res.status}`);
  return json.data ?? json;
}

export async function submitOwnAccount(token: string, environment: 'TEST' | 'PRODUCTION') {
  return apiFetch<any>('/fiat/own-account/submit', {
    token,
    method: 'POST',
    body: JSON.stringify({ environment }),
  });
}

export async function startGlobalBankKyc(token: string, environment: 'TEST' | 'PRODUCTION') {
  try {
    return await apiFetch<any>('/fiat/global/kyc', {
      token,
      method: 'POST',
      body: JSON.stringify({ environment }),
    });
  } catch (err) {
    remapBankIdentityError(err);
  }
}

export async function simulateGlobalBankKyc(token: string, environment: 'TEST' | 'PRODUCTION') {
  try {
    return await apiFetch<any>('/fiat/global/kyc/simulate', {
      token,
      method: 'POST',
      body: JSON.stringify({ environment }),
    });
  } catch (err) {
    remapBankIdentityError(err);
  }
}

export async function createGlobalBankFee(
  token: string,
  environment: 'TEST' | 'PRODUCTION',
  rail: string,
) {
  return apiFetch<any>('/fiat/global/fees', {
    token,
    method: 'POST',
    body: JSON.stringify({ environment, rail }),
  });
}

export async function getGlobalBankDestinationMessage(
  token: string,
  environment: 'TEST' | 'PRODUCTION',
  rail: string,
  address: string,
) {
  const qs = new URLSearchParams({ environment, rail, address });
  return apiFetch<{ message: string }>(`/fiat/global/destination-message?${qs.toString()}`, { token });
}

export async function openGlobalBankAccount(
  token: string,
  data: {
    environment: 'TEST' | 'PRODUCTION';
    rail: string;
    destinationAddress: string;
    destinationChainId: number;
    destinationTokenKey: string;
    destinationSignature: string;
  },
) {
  return apiFetch<any>('/fiat/global/accounts', {
    token,
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getGlobalBankAccount(token: string, accountId: string) {
  return apiFetch<any>(`/fiat/global/accounts/${accountId}`, { token });
}

export async function simulateGlobalBankInbound(token: string, accountId: string) {
  return apiFetch<any>(`/fiat/global/accounts/${accountId}/simulate-inbound`, {
    token,
    method: 'POST',
  });
}
