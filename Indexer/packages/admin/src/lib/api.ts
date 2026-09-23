import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
};

// Chains API
export const chainsApi = {
  list: () => api.get('/admin/chains'),
  get: (id: string) => api.get(`/admin/chains/${id}`),
  create: (data: Record<string, unknown>) => api.post('/admin/chains', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/admin/chains/${id}`, data),
  delete: (id: string) => api.delete(`/admin/chains/${id}`),
  testRpc: (id: string) => api.post(`/admin/chains/${id}/test-rpc`),
  addRpcUrls: (id: string, urls: string[]) => api.post(`/admin/chains/${id}/rpcs`, { urls }),
  removeRpcUrl: (id: string, url: string) => api.delete(`/admin/chains/${id}/rpcs`, { data: { url } }),
  resetNativeIndex: (id: string, backfillBlocks?: number) =>
    api.post(`/admin/chains/${id}/native-index-reset`, { backfillBlocks: backfillBlocks ?? 100 }),
  getNativeIndexState: () => api.get('/admin/chains/native-index-state'),
};

// Projects API
export const projectsApi = {
  list: () => api.get('/admin/projects'),
  get: (id: string) => api.get(`/admin/projects/${id}`),
  create: (data: Record<string, unknown>) => api.post('/admin/projects', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/admin/projects/${id}`, data),
  delete: (id: string) => api.delete(`/admin/projects/${id}`),
  regenerateKey: (id: string) => api.post(`/admin/projects/${id}/regenerate-key`),
};

// Contracts API
export const contractsApi = {
  list: (params?: { projectId?: string; chainId?: number }) =>
    api.get('/admin/contracts', { params }),
  get: (id: string) => api.get(`/admin/contracts/${id}`),
  create: (data: Record<string, unknown>) => api.post('/admin/contracts', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/admin/contracts/${id}`, data),
  delete: (id: string) => api.delete(`/admin/contracts/${id}`),
  updateEvent: (contractId: string, eventId: string, data: Record<string, unknown>) =>
    api.put(`/admin/contracts/${contractId}/events/${eventId}`, data),
  updateEventFilter: (contractId: string, eventId: string, filterConditions: Record<string, unknown> | null) =>
    api.put(`/admin/contracts/${contractId}/events/${eventId}`, { filterConditions }),
  addEvents: (contractId: string, data: { abi: unknown; selectedEvents: string[] }) =>
    api.post(`/admin/contracts/${contractId}/add-events`, data),
  backfill: (id: string, data: Record<string, unknown>) =>
    api.post(`/admin/contracts/${id}/backfill`, data),
  fetchIdl: (chainId: number, programId: string) =>
    api.post('/admin/contracts/fetch-idl', { chainId, programId }),
  fetchManifest: (chainId: number, packageId: string) =>
    api.post('/admin/contracts/fetch-manifest', { chainId, packageId }),
};

// Webhooks API
export const webhooksApi = {
  list: (params?: { projectId?: string }) =>
    api.get('/admin/webhooks', { params }),
  get: (id: string) => api.get(`/admin/webhooks/${id}`),
  create: (data: Record<string, unknown>) => api.post('/admin/webhooks', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/admin/webhooks/${id}`, data),
  delete: (id: string) => api.delete(`/admin/webhooks/${id}`),
  test: (id: string) => api.post(`/admin/webhooks/${id}/test`),
  retry: (webhookId: string, deliveryId: string) =>
    api.post(`/admin/webhooks/${webhookId}/deliveries/${deliveryId}/retry`),
  syncSubscriptions: (webhookId: string, eventSubscriptionIds: string[]) =>
    api.put(`/admin/webhooks/${webhookId}/subscriptions`, { eventSubscriptionIds }),
  subscribeEvent: (webhookId: string, eventSubscriptionId: string) =>
    api.post(`/admin/webhooks/${webhookId}/events/${eventSubscriptionId}`),
  unsubscribeEvent: (webhookId: string, eventSubscriptionId: string) =>
    api.delete(`/admin/webhooks/${webhookId}/events/${eventSubscriptionId}`),
  regenerateSecret: (id: string) =>
    api.post(`/admin/webhooks/${id}/regenerate-secret`),
  getDeliveries: (id: string, params?: { status?: string; limit?: number }) =>
    api.get(`/admin/webhooks/${id}/deliveries`, { params }),
  retryDelivery: (deliveryId: string) =>
    api.post(`/admin/deliveries/${deliveryId}/retry`),
};

// Watched addresses (native transfer tracking)
export const watchedAddressesApi = {
  list: (params?: { projectId?: string; chainId?: number }) =>
    api.get('/admin/watched-addresses', { params }),
  get: (id: string) => api.get(`/admin/watched-addresses/${id}`),
  create: (data: { projectId: string; chainId: number | null; address: string; direction?: 'in' | 'out' | 'both'; label?: string }) =>
    api.post('/admin/watched-addresses', data),
  update: (id: string, data: { direction?: 'in' | 'out' | 'both'; label?: string | null }) =>
    api.patch(`/admin/watched-addresses/${id}`, data),
  bulkCreate: (data: { projectId: string; chainId: number | null; addresses: string[]; direction?: 'in' | 'out' | 'both'; label?: string }) =>
    api.post('/admin/watched-addresses/bulk', data),
  delete: (id: string) => api.delete(`/admin/watched-addresses/${id}`),
};

// Native transfers (admin uses Bearer + optional projectId)
export const nativeTransfersApi = {
  list: (params?: { projectId?: string; chainId?: number; address?: string; fromBlock?: string; toBlock?: string; limit?: number; offset?: number }) =>
    api.get('/native-transfers', { params }),
};

// Events API
export const eventsApi = {
  list: (params?: { contractId?: string; chainId?: string; eventName?: string; page?: number; limit?: number }) => {
    const { page, limit, ...rest } = params || {};
    const offset = page && limit ? (page - 1) * limit : undefined;
    return api.get('/events', { params: { ...rest, limit, offset } });
  },
  get: (id: string) => api.get(`/events/${id}`),
  byContract: (contractId: string, limit?: number) =>
    api.get(`/events/contract/${contractId}`, { params: { limit } }),
  retriggerWebhooks: (id: string) =>
    api.post(`/events/${id}/retrigger-webhooks`),
};

// Health API
export const healthApi = {
  basic: () => api.get('/health'),
  detailed: () => api.get('/health/detailed'),
};

// Settings API
export const settingsApi = {
  getAll: () => api.get('/admin/settings'),
  update: (settings: Record<string, string>) =>
    api.put('/admin/settings', { settings }),
};
