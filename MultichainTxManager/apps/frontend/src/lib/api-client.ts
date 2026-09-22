import type {
  AdminUser,
  ApiResponse,
  AuthTokens,
  Chain,
  CreateChainInput,
  CreateProjectInput,
  CreateSignerKeyInput,
  CreateWebhookInput,
  LoginCredentials,
  PaginatedResponse,
  Project,
  SendTransactionInput,
  Setting,
  SignTypedDataInput,
  ProjectFundingConfig,
  SignerDetail,
  SignerKey,
  Transaction,
  TransactionFilters,
  UpdateChainInput,
  UpdateProjectInput,
  UpdateSignerKeyInput,
  UpdateWebhookInput,
  WebhookDelivery,
  WebhookDeliveryFilters,
  WebhookEndpoint,
} from "@mtxm/shared";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/** In-memory access token — never touches localStorage (XSS-safe) */
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return "";
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

// ────────────────────────────────────────────────────────────
// Core fetch wrapper with 401 auto-refresh
// ────────────────────────────────────────────────────────────

let _refreshPromise: Promise<string | null> | null = null;

/** Try to get a new access token using the HttpOnly refresh cookie */
async function attemptTokenRefresh(): Promise<string | null> {
  // Deduplicate concurrent refresh calls
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // sends HttpOnly cookie
      });
      if (!resp.ok) return null;
      const json = await resp.json();
      const newToken = json.data?.accessToken ?? null;
      setAccessToken(newToken);
      return newToken;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAccessToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const doFetch = (hdrs: Record<string, string>) =>
    fetch(`${API_BASE}${path}`, { ...options, headers: hdrs, credentials: "include" });

  let response = await doFetch(headers);

  // ── 401 interceptor: attempt silent refresh then retry once ──
  if (response.status === 401 && !path.includes("/auth/refresh") && !path.includes("/auth/login")) {
    const newToken = await attemptTokenRefresh();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      response = await doFetch(headers);
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error: Error & { status?: number; errors?: Record<string, string[]> } =
      new Error(body.message ?? `Request failed with status ${response.status}`);
    error.status = response.status;
    error.errors = body.errors;
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

function get<T>(path: string) {
  return request<T>(path);
}

function post<T>(path: string, body?: unknown) {
  return request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

function patch<T>(path: string, body: unknown) {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

function del<T>(path: string) {
  return request<T>(path, { method: "DELETE" });
}

// ────────────────────────────────────────────────────────────
// API client — grouped by resource
// ────────────────────────────────────────────────────────────

export const apiClient = {
  // ── Auth ──────────────────────────────────────────────────
  auth: {
    login: (data: LoginCredentials) =>
      post<ApiResponse<{ user: AdminUser; tokens: { accessToken: string } }>>("/api/v1/auth/login", data),

    refresh: () =>
      post<ApiResponse<{ accessToken: string }>>("/api/v1/auth/refresh"),

    logout: () =>
      post<ApiResponse<{ message: string }>>("/api/v1/auth/logout"),

    me: () =>
      get<ApiResponse<AdminUser>>("/api/v1/auth/me"),
  },

  // ── Projects ──────────────────────────────────────────────
  projects: {
    list: () =>
      get<ApiResponse<Project[]>>("/api/v1/projects"),

    get: (id: string) =>
      get<ApiResponse<Project>>(`/api/v1/projects/${id}`),

    create: (data: CreateProjectInput) =>
      post<ApiResponse<Project>>("/api/v1/projects", data),

    update: (id: string, data: UpdateProjectInput) =>
      patch<ApiResponse<Project>>(`/api/v1/projects/${id}`, data),

    delete: (id: string) =>
      del<void>(`/api/v1/projects/${id}`),

    regenerateApiKey: (id: string) =>
      post<ApiResponse<{ apiKey: string }>>(`/api/v1/projects/${id}/regenerate-key`),
  },

  // ── Chains ────────────────────────────────────────────────
  chains: {
    list: (projectId: string) =>
      get<ApiResponse<Chain[]>>(`/api/v1/projects/${projectId}/chains`),

    create: (projectId: string, data: CreateChainInput) =>
      post<ApiResponse<Chain>>(`/api/v1/projects/${projectId}/chains`, data),

    update: (projectId: string, chainId: string, data: UpdateChainInput) =>
      patch<ApiResponse<Chain>>(`/api/v1/projects/${projectId}/chains/${chainId}`, data),

    delete: (projectId: string, chainId: string) =>
      del<void>(`/api/v1/projects/${projectId}/chains/${chainId}`),
  },

  fundingConfig: {
    get: (projectId: string) =>
      get<ApiResponse<ProjectFundingConfig>>(`/api/v1/projects/${projectId}/funding-config`),

    updateChain: (
      projectId: string,
      chainDbId: string,
      data: { minBalanceEth?: string | null; fundAmountEth?: string | null },
    ) =>
      patch<ApiResponse<ProjectFundingConfig>>(`/api/v1/projects/${projectId}/funding-config/${chainDbId}`, data),
  },

  // ── Signers ───────────────────────────────────────────────
  signers: {
    list: (projectId: string) =>
      get<ApiResponse<SignerKey[]>>(`/api/v1/projects/${projectId}/signers`),

    create: (projectId: string, data: CreateSignerKeyInput) =>
      post<ApiResponse<SignerKey>>(`/api/v1/projects/${projectId}/signers`, data),

    update: (projectId: string, signerId: string, data: UpdateSignerKeyInput) =>
      patch<ApiResponse<SignerKey>>(`/api/v1/projects/${projectId}/signers/${signerId}`, data),

    deactivate: (projectId: string, signerId: string) =>
      post<ApiResponse<SignerKey>>(`/api/v1/projects/${projectId}/signers/${signerId}/deactivate`),

    activate: (projectId: string, signerId: string) =>
      post<ApiResponse<SignerKey>>(`/api/v1/projects/${projectId}/signers/${signerId}/activate`),

    setMaster: (projectId: string, signerId: string) =>
      post<ApiResponse<SignerKey>>(`/api/v1/projects/${projectId}/signers/${signerId}/set-master`),

    unsetMaster: (projectId: string, signerId: string) =>
      post<ApiResponse<SignerKey>>(`/api/v1/projects/${projectId}/signers/${signerId}/unset-master`),

    getDetail: (projectId: string, signerId: string) =>
      get<ApiResponse<SignerDetail>>(`/api/v1/projects/${projectId}/signers/${signerId}/detail`),

    fund: (projectId: string, signerId: string, chainDbId: string) =>
      post<ApiResponse<{ txHash: string }>>(`/api/v1/projects/${projectId}/signers/${signerId}/fund`, { chainDbId }),

    emergencyTransfer: (
      projectId: string,
      signerId: string,
      data: { chainId: string; toAddress: string; amountWei: string; forceNonce?: number },
    ) =>
      post<ApiResponse<{ txHash: string }>>(`/api/v1/projects/${projectId}/signers/${signerId}/emergency-transfer`, data),

    resetNonce: (projectId: string, signerId: string, chainId: string) =>
      post<ApiResponse<{ chainDbId: string; chainName: string; chainId: number; address: string; previousNonce: number | null; syncedNonce: number }>>(
        `/api/v1/projects/${projectId}/signers/${signerId}/reset-nonce`,
        { chainId },
      ),
  },

  // ── Transactions ──────────────────────────────────────────
  transactions: {
    list: (projectId: string, filters?: TransactionFilters) =>
      get<ApiResponse<PaginatedResponse<Transaction>>>(
        `/api/v1/projects/${projectId}/transactions${buildQueryString(filters as Record<string, unknown>)}`,
      ),

    get: (projectId: string, txId: string) =>
      get<ApiResponse<Transaction>>(`/api/v1/projects/${projectId}/transactions/${txId}`),

    send: (projectId: string, data: SendTransactionInput) =>
      post<ApiResponse<Transaction>>(`/api/v1/projects/${projectId}/transactions/send`, data),

    signTypedData: (projectId: string, data: SignTypedDataInput) =>
      post<ApiResponse<{ signature: string }>>(`/api/v1/projects/${projectId}/transactions/sign-typed`, data),
  },

  // ── Webhooks ──────────────────────────────────────────────
  webhooks: {
    list: (projectId: string) =>
      get<ApiResponse<WebhookEndpoint[]>>(`/api/v1/projects/${projectId}/webhooks`),

    getById: (projectId: string, webhookId: string) =>
      get<ApiResponse<WebhookEndpoint>>(`/api/v1/projects/${projectId}/webhooks/${webhookId}`),

    create: (projectId: string, data: CreateWebhookInput) =>
      post<ApiResponse<WebhookEndpoint>>(`/api/v1/projects/${projectId}/webhooks`, data),

    update: (projectId: string, webhookId: string, data: UpdateWebhookInput) =>
      patch<ApiResponse<WebhookEndpoint>>(`/api/v1/projects/${projectId}/webhooks/${webhookId}`, data),

    delete: (projectId: string, webhookId: string) =>
      del<void>(`/api/v1/projects/${projectId}/webhooks/${webhookId}`),

    rotateSecret: (projectId: string, webhookId: string) =>
      post<ApiResponse<{ secret: string }>>(`/api/v1/projects/${projectId}/webhooks/${webhookId}/rotate-secret`),

    test: (projectId: string, webhookId: string) =>
      post<ApiResponse<WebhookDelivery>>(`/api/v1/projects/${projectId}/webhooks/${webhookId}/test`),

    deliveries: (projectId: string, webhookId: string, filters?: WebhookDeliveryFilters) =>
      get<ApiResponse<PaginatedResponse<WebhookDelivery>>>(
        `/api/v1/projects/${projectId}/webhooks/${webhookId}/deliveries${buildQueryString(filters as Record<string, unknown>)}`,
      ),

    retryDelivery: (projectId: string, webhookId: string, deliveryId: string) =>
      post<ApiResponse<{ deliveryId: string; status: string }>>(
        `/api/v1/projects/${projectId}/webhooks/${webhookId}/deliveries/${deliveryId}/retry`,
      ),
  },

  // ── Settings ────────────────────────────────────────────────
  settings: {
    list: () =>
      get<ApiResponse<Setting[]>>("/api/v1/settings"),

    update: (key: string, value: string) =>
      patch<ApiResponse<Setting>>(`/api/v1/settings/${key}`, { value }),
  },
};
