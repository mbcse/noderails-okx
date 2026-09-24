const API_BASE = process.env.NEXT_PUBLIC_BPC_API_URL ?? 'http://localhost:8090';

interface FetchOptions extends RequestInit {
  token?: string;
}

async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { token, headers: extraHeaders, ...rest } = opts;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((extraHeaders as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include', headers, ...rest });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? `Request failed: ${res.status}`);
  return json.data ?? json;
}

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

export async function getHealth(token: string) {
  return apiFetch<any>('/admin/health', { token });
}

export async function getChains(token: string) {
  return apiFetch<any[]>('/admin/chains', { token });
}

export async function createChain(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/admin/chains', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateChain(token: string, chainId: number, data: Record<string, unknown>) {
  return apiFetch<any>(`/admin/chains/${chainId}`, { token, method: 'PUT', body: JSON.stringify(data) });
}

export async function getRpcEndpoints(token: string, chainId?: number) {
  const q = chainId ? `?chainId=${chainId}` : '';
  return apiFetch<any[]>(`/admin/rpc-endpoints${q}`, { token });
}

export async function createRpcEndpoint(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/admin/rpc-endpoints', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateRpcEndpoint(token: string, id: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/admin/rpc-endpoints/${id}`, { token, method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteRpcEndpoint(token: string, id: string) {
  return apiFetch(`/admin/rpc-endpoints/${id}`, { token, method: 'DELETE' });
}

export async function testRpcEndpoint(token: string, id: string) {
  return apiFetch<{ ok: boolean; latencyMs: number; error?: string }>(`/admin/rpc-endpoints/${id}/test`, {
    token,
    method: 'POST',
  });
}

export async function getTokens(token: string, chainId?: number) {
  const q = chainId ? `?chainId=${chainId}` : '';
  return apiFetch<any[]>(`/admin/tokens${q}`, { token });
}

export async function createToken(token: string, data: Record<string, unknown>) {
  return apiFetch<any>('/admin/tokens', { token, method: 'POST', body: JSON.stringify(data) });
}

export async function updateToken(token: string, id: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/admin/tokens/${id}`, { token, method: 'PATCH', body: JSON.stringify(data) });
}

export async function getPriceSources(token: string) {
  return apiFetch<any[]>('/admin/price-sources', { token });
}

export async function updatePriceSource(token: string, id: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/admin/price-sources/${id}`, { token, method: 'PATCH', body: JSON.stringify(data) });
}
