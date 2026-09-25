const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8080';

export const SESSION_EXPIRED_MESSAGE = 'Please sign in again.';

let sessionToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
const sessionListeners = new Set<(token: string | null) => void>();

export function syncAdminSession(token: string | null) {
  sessionToken = token;
}

export function subscribeAdminSession(listener: (token: string | null) => void) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

function notifyAdminSession(token: string | null) {
  for (const listener of sessionListeners) listener(token);
}

function isAuthBoundaryPath(path: string) {
  return (
    path === '/admin/auth/login' ||
    path === '/admin/auth/refresh'
  );
}

async function postRefresh<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Request failed: ${res.status}`);
  }
  return (json.data ?? json) as T;
}

export async function refreshAdminAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const result = await postRefresh<{ accessToken: string }>('/admin/auth/refresh');
      sessionToken = result.accessToken;
      notifyAdminSession(result.accessToken);
      return result.accessToken;
    } catch {
      sessionToken = null;
      notifyAdminSession(null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

interface FetchOptions extends RequestInit {
  token?: string;
  _retried?: boolean;
}

async function request(path: string, opts: FetchOptions = {}): Promise<Response> {
  const { token, headers: extraHeaders, _retried, ...rest } = opts;
  const bearer = sessionToken ?? token ?? undefined;

  const isFormData = typeof FormData !== 'undefined' && rest.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...((extraHeaders as Record<string, string>) ?? {}),
  };
  if (isFormData) delete headers['Content-Type'];

  if (bearer) {
    headers['Authorization'] = `Bearer ${bearer}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers,
    ...rest,
  });

  if (res.status === 401 && !_retried && !isAuthBoundaryPath(path) && Boolean(bearer)) {
    const next = await refreshAdminAccessToken();
    if (next) {
      return request(path, { ...opts, token: next, _retried: true });
    }
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  return res;
}

async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const res = await request(path, opts);
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error?.message ?? `Request failed: ${res.status}`);
  }

  if (json.pagination) {
    return {
      items: json.data ?? [],
      ...json.pagination,
      hasMore: json.pagination.page < json.pagination.totalPages,
    } as T;
  }

  return json.data ?? json;
}

// ── Admin Auth ──

export async function adminLogin(email: string, password: string) {
  return apiFetch<{ accessToken: string; admin: { email: string; role: string } }>('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function adminRefresh() {
  return apiFetch<{ accessToken: string; admin: { email: string; role: string } }>('/admin/auth/refresh', {
    method: 'POST',
  });
}

export async function adminLogout() {
  return apiFetch('/admin/auth/logout', { method: 'POST' });
}

// ── Overview ──

export async function getOverview(token: string) {
  return apiFetch<any>('/admin/overview', { token });
}

// ── Chains ──

export async function getChains(token: string) {
  return apiFetch<any[]>('/admin/chains', { token });
}

export async function createChain(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/admin/chains', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateChain(token: string, chainId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/admin/chains/${chainId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteChain(token: string, chainId: string) {
  return apiFetch<any>(`/admin/chains/${chainId}`, { token, method: 'DELETE' });
}

// ── Tokens ──

export async function getTokens(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/admin/tokens${qs}`, { token });
}

export async function createToken(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/admin/tokens', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateToken(token: string, tokenId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/admin/tokens/${tokenId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteToken(token: string, tokenId: string) {
  return apiFetch<any>(`/admin/tokens/${tokenId}`, { token, method: 'DELETE' });
}

// ── Currencies ──

export async function getCurrencies(token: string) {
  return apiFetch<any[]>('/admin/currencies', { token });
}

export async function createCurrency(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/admin/currencies', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateCurrency(token: string, currencyId: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/admin/currencies/${currencyId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteCurrency(token: string, currencyId: string) {
  return apiFetch<any>(`/admin/currencies/${currencyId}`, { token, method: 'DELETE' });
}

// ── Merchants ──

export async function getMerchants(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/admin/merchants${qs}`, { token });
}

export async function getMerchantDetail(token: string, merchantId: string) {
  return apiFetch<any>(`/admin/merchants/${merchantId}`, { token });
}

export async function suspendMerchant(token: string, merchantId: string, reason?: string) {
  return apiFetch<any>(`/admin/merchants/${merchantId}/suspend`, {
    token,
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function unsuspendMerchant(token: string, merchantId: string) {
  return apiFetch<any>(`/admin/merchants/${merchantId}/unsuspend`, { token, method: 'POST' });
}

// ── Apps ──

export async function getAllApps(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/admin/apps${qs}`, { token });
}

// ── Contract Deployments ──

export async function getContractDeployments(token: string) {
  return apiFetch<any[]>('/admin/contracts', { token });
}

export async function createContractDeployment(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/admin/contracts', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateContractDeployment(token: string, id: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/admin/contracts/${id}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteContractDeployment(token: string, id: string) {
  return apiFetch<any>(`/admin/contracts/${id}`, { token, method: 'DELETE' });
}

// ── Timelock Config ──

export async function getTimelockConfig(token: string) {
  return apiFetch<{ disputeStartSeconds: number; settlementSeconds: number }>('/admin/timelock-config', { token });
}

export async function updateTimelockConfig(token: string, data: { disputeStartSeconds?: number; settlementSeconds?: number }) {
  return apiFetch<{ disputeStartSeconds: number; settlementSeconds: number }>('/admin/timelock-config', {
    token,
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getMerchantTimelockConfig(token: string, merchantId: string) {
  return apiFetch<{
    override: { disputeStartSeconds: number; settlementSeconds: number } | null;
    effective: { disputeStartSeconds: number; settlementSeconds: number };
  }>(`/admin/merchants/${merchantId}/timelock-config`, { token });
}

export async function setMerchantTimelockConfig(
  token: string,
  merchantId: string,
  data: { disputeStartSeconds: number; settlementSeconds: number },
) {
  return apiFetch<{ disputeStartSeconds: number; settlementSeconds: number }>(
    `/admin/merchants/${merchantId}/timelock-config`,
    { token, method: 'PUT', body: JSON.stringify(data) },
  );
}

export async function removeMerchantTimelockConfig(token: string, merchantId: string) {
  return apiFetch<void>(`/admin/merchants/${merchantId}/timelock-config`, { token, method: 'DELETE' });
}

// ── Fee Config ──

export async function getFeeConfig(token: string) {
  return apiFetch<{
    feeBps: number;
    conversionFeeBps: number;
    singleChainSettlementFeeBps: number;
    bankSettlementFeeBps: number;
    swapQuoteTtlSeconds: number;
  }>('/admin/fee-config', { token });
}

export async function updateFeeConfig(token: string, data: {
  feeBps?: number;
  conversionFeeBps?: number;
  singleChainSettlementFeeBps?: number;
  bankSettlementFeeBps?: number;
  swapQuoteTtlSeconds?: number;
}) {
  return apiFetch<{
    feeBps: number;
    conversionFeeBps: number;
    singleChainSettlementFeeBps: number;
    bankSettlementFeeBps: number;
    swapQuoteTtlSeconds: number;
  }>('/admin/fee-config', {
    token,
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getBridgePayments(token: string, params?: Record<string, string>) {
  const search = params ? `?${new URLSearchParams(params).toString()}` : '';
  return apiFetch<{
    items: Array<Record<string, unknown>>;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>(`/admin/bridge-payments${search}`, { token });
}

export async function getBridgePayment(token: string, id: string) {
  return apiFetch<Record<string, unknown>>(`/admin/bridge-payments/${id}`, { token });
}

export async function retryBridgePayment(token: string, id: string) {
  return apiFetch<{ ok: boolean }>(`/admin/bridge-payments/${id}/retry`, { token, method: 'POST' });
}

export async function stuckCreditBridgePayment(token: string, id: string) {
  return apiFetch<{ ok: boolean }>(`/admin/bridge-payments/${id}/stuck-credit`, { token, method: 'POST' });
}

export async function getMerchantFeeConfig(token: string, merchantId: string) {
  return apiFetch<{
    override: number | null;
    effective: number;
  }>(`/admin/merchants/${merchantId}/fee-config`, { token });
}

export async function setMerchantFeeConfig(token: string, merchantId: string, data: { feeBps: number }) {
  return apiFetch<number>(
    `/admin/merchants/${merchantId}/fee-config`,
    { token, method: 'PUT', body: JSON.stringify(data) },
  );
}

export async function removeMerchantFeeConfig(token: string, merchantId: string) {
  return apiFetch<void>(`/admin/merchants/${merchantId}/fee-config`, { token, method: 'DELETE' });
}

// ── Webhook Delivery Config ──

export async function getWebhookConfig(token: string) {
  return apiFetch<{
    redundantSends: number;
    redundantDelaysMs: number[];
    baseDelayMs: number;
    backoffMultiplier: number;
    maxDelayMs: number;
    maxRetries: number;
  }>('/admin/webhook-config', { token });
}

export async function updateWebhookConfig(token: string, data: {
  redundantSends?: number;
  redundantDelaysMs?: number[];
  baseDelayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  maxRetries?: number;
}) {
  return apiFetch<{
    redundantSends: number;
    redundantDelaysMs: number[];
    baseDelayMs: number;
    backoffMultiplier: number;
    maxDelayMs: number;
    maxRetries: number;
  }>('/admin/webhook-config', {
    token, method: 'PUT', body: JSON.stringify(data),
  });
}

// ── Merchant Refunds ──

export async function getMerchantRefunds(token: string, merchantId: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/admin/merchants/${merchantId}/refunds${qs}`, { token });
}

// ── Disputes ──

export async function getDisputes(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/disputes/admin${qs}`, { token });
}

export async function getDispute(token: string, disputeId: string) {
  return apiFetch<any>(`/disputes/admin/${disputeId}`, { token });
}

export async function resolveDispute(token: string, disputeId: string, winner: 'MERCHANT' | 'CUSTOMER') {
  return apiFetch<any>(`/disputes/admin/${disputeId}/resolve`, {
    token, method: 'POST', body: JSON.stringify({ winner }),
  });
}

// ── Feedback ──

export async function getFeedbackSubmissions(
  token: string,
  params?: Record<string, string>,
) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/admin/feedback${qs}`, { token });
}

export async function updateFeedbackSubmissionStatus(
  token: string,
  id: string,
  status: 'NEW' | 'REVIEWED' | 'CLOSED',
) {
  return apiFetch<any>(`/admin/feedback/${id}/status`, {
    token,
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

// ── Short links ──

export type ShortLinkStatus = 'ACTIVE' | 'DISABLED';

export interface ShortLinkRow {
  id: string;
  slug: string;
  publicPath: string;
  publicUrl: string;
  destinationUrl: string;
  title: string | null;
  status: ShortLinkStatus;
  collectEmail: boolean;
  hasPassword: boolean;
  clickCount: number;
  leadCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function getShortLinks(token: string) {
  return apiFetch<ShortLinkRow[]>('/admin/links', { token });
}

export async function createShortLink(token: string, data: Record<string, unknown>) {
  return apiFetch<ShortLinkRow>('/admin/links', {
    token,
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getShortLink(token: string, id: string) {
  return apiFetch<ShortLinkRow & {
    analytics: {
      clicksByDay: Array<{ date: string; count: number }>;
      clicks: Array<{
        id: string;
        createdAt: string;
        referrer: string | null;
        referrerHost: string | null;
        userAgent: string | null;
        browser: string;
        os: string;
        device: string;
      }>;
      leads: Array<{ id: string; email: string; createdAt: string }>;
      activity: Array<{
        id: string;
        kind: 'email' | 'click';
        createdAt: string;
        email: string | null;
        summary: string;
        browser?: string;
        device?: string;
        referrerHost?: string | null;
      }>;
      lastClickAt: string | null;
      lastLeadAt: string | null;
      clicksReturned: number;
      leadsReturned: number;
    };
  }>(`/admin/links/${id}`, { token });
}

export async function updateShortLink(token: string, id: string, data: Record<string, unknown>) {
  return apiFetch<ShortLinkRow>(`/admin/links/${id}`, {
    token,
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteShortLink(token: string, id: string) {
  return apiFetch<{ ok: boolean }>(`/admin/links/${id}`, { token, method: 'DELETE' });
}

// ── Bank ──

export async function getBankFeeConfig(token: string) {
  return apiFetch<any>('/admin/bank/fee-config', { token });
}

export async function updateBankFeeConfig(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/admin/bank/fee-config', {
    token,
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function getBankCharges(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/admin/bank/charges${qs}`, { token });
}

export async function getBankCharge(token: string, id: string) {
  return apiFetch<any>(`/admin/bank/charges/${id}`, { token });
}

export async function getBankOwnAccounts(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/admin/bank/own-accounts${qs}`, { token });
}

export async function getBankOwnAccount(token: string, id: string) {
  return apiFetch<any>(`/admin/bank/own-accounts/${id}`, { token });
}

export async function getBankOwnAccountStatement(
  token: string,
  id: string,
  kind?: 'live' | 'pending',
) {
  const qs = kind ? `?kind=${kind}` : '';
  return apiFetch<{ url: string }>(`/admin/bank/own-accounts/${id}/statement${qs}`, { token });
}

export async function approveBankOwnAccount(token: string, id: string, note?: string) {
  return apiFetch<any>(`/admin/bank/own-accounts/${id}/approve`, {
    token,
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export async function rejectBankOwnAccount(token: string, id: string, reason: string) {
  return apiFetch<any>(`/admin/bank/own-accounts/${id}/reject`, {
    token,
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function getBankAccounts(token: string) {
  return apiFetch<any[]>('/admin/bank/accounts', { token });
}

export async function getBankAccountActivity(token: string, id: string) {
  return apiFetch<any>(`/admin/bank/accounts/${id}/activity`, { token });
}

export async function simulateBankInbound(token: string, id: string) {
  return apiFetch<any>(`/admin/bank/accounts/${id}/simulate-inbound`, {
    token,
    method: 'POST',
  });
}

export async function getEmailFromAddresses(token: string) {
  return apiFetch<{ addresses: string[]; defaultFrom: string; trackingPublic?: boolean }>('/admin/email-from-addresses', { token });
}

export async function uploadEmailCampaignImage(token: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  return apiFetch<{ url: string; key: string }>('/admin/email-campaigns/images', {
    token,
    method: 'POST',
    body,
  });
}

export async function getEmailPeople(token: string, params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
  return apiFetch<{ items: any[]; total: number; page: number; pageSize: number }>(`/admin/email-people${qs}`, { token });
}

export async function getEmailPeopleStats(token: string) {
  return apiFetch<{ total: number; registered: number; added: number }>('/admin/email-people/stats', { token });
}

export async function addEmailPerson(token: string, data: { email: string; name?: string; bucketIds?: string[] }) {
  return apiFetch<any & { alreadyOnList?: boolean }>('/admin/email-people', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function importEmailPeople(token: string, csv: string, bucketIds?: string[]) {
  return apiFetch<{ added: number; skipped: number; errors: Array<{ row: number; message: string }> }>(
    '/admin/email-people/import',
    { token, method: 'POST', body: JSON.stringify({ csv, bucketIds }) },
  );
}

export async function deleteEmailPerson(token: string, listContactId: string) {
  return apiFetch<{ ok: boolean }>(`/admin/email-people/${listContactId}`, { token, method: 'DELETE' });
}

export async function getEmailCampaignTemplates(token: string) {
  return apiFetch<{ templates: Array<{
    id: string;
    label: string;
    description: string;
    category: 'outreach' | 'broadcast';
    suggestedFrom: string;
  }> }>('/admin/email-campaign-templates', { token });
}

export async function getEmailCampaigns(token: string, params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
  return apiFetch<{ items: any[]; total: number; page: number; pageSize: number }>(`/admin/email-campaigns${qs}`, { token });
}

export async function createEmailCampaign(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/admin/email-campaigns', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateEmailCampaign(token: string, id: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/admin/email-campaigns/${id}`, { token, method: 'PATCH', body: JSON.stringify(data) });
}

export async function previewEmailCampaignHtml(token: string, data: Record<string, unknown>) {
  return apiFetch<{ html: string }>('/admin/email-campaigns/preview-html', {
    token,
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getEmailCampaign(token: string, id: string, params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
  return apiFetch<any>(`/admin/email-campaigns/${id}${qs}`, { token });
}

export async function getEmailCampaignActivity(token: string, id: string, params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
  return apiFetch<{ items: any[]; total: number }>(`/admin/email-campaigns/${id}/activity${qs}`, { token });
}

export async function getEmailBuckets(token: string) {
  return apiFetch<{ buckets: Array<{ id: string; name: string; slug: string; memberCount: number }> }>(
    '/admin/email-buckets',
    { token },
  );
}

export async function createEmailBucket(token: string, name: string) {
  return apiFetch<any>('/admin/email-buckets', { token, method: 'POST', body: JSON.stringify({ name }) });
}

export async function renameEmailBucket(token: string, id: string, name: string) {
  return apiFetch<any>(`/admin/email-buckets/${id}`, { token, method: 'PATCH', body: JSON.stringify({ name }) });
}

export async function deleteEmailBucket(token: string, id: string) {
  return apiFetch<{ ok: boolean }>(`/admin/email-buckets/${id}`, { token, method: 'DELETE' });
}

export async function setEmailPersonBuckets(token: string, email: string, bucketIds: string[]) {
  return apiFetch<{ buckets: Array<{ id: string; name: string }> }>(
    `/admin/email-people/${encodeURIComponent(email)}/buckets`,
    { token, method: 'PUT', body: JSON.stringify({ bucketIds }) },
  );
}

export async function addEmailBucketMembers(
  token: string,
  bucketId: string,
  data: { emails?: string[]; personKeys?: string[] },
) {
  return apiFetch<{ added: number }>(`/admin/email-buckets/${bucketId}/members`, {
    token,
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function removeEmailBucketMembers(
  token: string,
  bucketId: string,
  emails: string[],
) {
  return apiFetch<{ removed: number }>(`/admin/email-buckets/${bucketId}/members`, {
    token,
    method: 'DELETE',
    body: JSON.stringify({ emails }),
  });
}

export async function getEmailUnsubscribes(token: string, params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
  return apiFetch<{ items: any[]; total: number }>(`/admin/email-unsubscribes${qs}`, { token });
}

export async function previewEmailCampaignAudience(
  token: string,
  id: string,
  data: { audience: string; personKeys?: string[]; bucketIds?: string[] },
) {
  return apiFetch<{ count: number; sample: Array<{ email: string; name: string | null; source: string }> }>(
    `/admin/email-campaigns/${id}/preview`,
    { token, method: 'POST', body: JSON.stringify(data) },
  );
}

export async function testEmailCampaign(token: string, id: string, to?: string) {
  return apiFetch<{ ok: boolean; to: string }>(`/admin/email-campaigns/${id}/test`, {
    token,
    method: 'POST',
    body: JSON.stringify({ to }),
  });
}

export async function sendEmailCampaign(token: string, id: string) {
  return apiFetch<any>(`/admin/email-campaigns/${id}/send`, { token, method: 'POST' });
}

export async function cancelEmailCampaign(token: string, id: string) {
  return apiFetch<any>(`/admin/email-campaigns/${id}/cancel`, { token, method: 'POST' });
}

export async function resendEmailCampaign(
  token: string,
  id: string,
  data?: {
    targets?: 'undelivered' | 'failed' | 'skipped' | 'all' | 'selected';
    recipientIds?: string[];
  },
) {
  return apiFetch<any>(`/admin/email-campaigns/${id}/resend`, {
    token,
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function duplicateEmailCampaign(token: string, id: string) {
  return apiFetch<any>(`/admin/email-campaigns/${id}/duplicate`, { token, method: 'POST' });
}

export async function deleteEmailCampaign(token: string, id: string) {
  return apiFetch<{ ok: boolean }>(`/admin/email-campaigns/${id}`, { token, method: 'DELETE' });
}
