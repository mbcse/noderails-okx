import { createHash, createVerify, randomUUID } from 'node:crypto';
import { TimeoutError } from '@noderails/common';
import { env } from '../config.js';

const BRIDGE_REPLAY_MS = 10 * 60 * 1000;

export class BridgeClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly webhookPublicKey: string,
    private readonly timeoutMs = env.BRIDGE_TIMEOUT_MS,
  ) {}

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  async createKycLink(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request('POST', '/v0/kyc_links', body);
  }

  async getKycLink(id: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/v0/kyc_links/${id}`);
  }

  async createCustomer(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request('POST', '/v0/customers', body);
  }

  async getCustomer(id: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/v0/customers/${id}`);
  }

  async simulateKycApproval(customerId: string): Promise<Record<string, unknown>> {
    return this.request('POST', `/v0/customers/${customerId}/simulate_kyc_approval`, {});
  }

  async createVirtualAccount(
    customerId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request('POST', `/v0/customers/${customerId}/virtual_accounts`, body);
  }

  async listVirtualAccounts(customerId: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/v0/customers/${customerId}/virtual_accounts`);
  }

  async getVirtualAccountHistory(
    customerId: string,
    virtualAccountId: string,
  ): Promise<{ count?: number; data?: Record<string, unknown>[] }> {
    return this.request(
      'GET',
      `/v0/customers/${customerId}/virtual_accounts/${virtualAccountId}/history`,
    );
  }

  verifyWebhook(rawBody: string, signatureHeader: string): boolean {
    if (!this.webhookPublicKey || !signatureHeader) return false;
    const parts: Record<string, string> = {};
    for (const part of signatureHeader.split(',')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      parts[part.slice(0, i).trim()] = part.slice(i + 1);
    }
    const timestamp = parts.t;
    const signature = parts.v0;
    if (!timestamp || !signature) return false;
    if (Math.abs(Date.now() - Number(timestamp)) > BRIDGE_REPLAY_MS) return false;
    const digest = createHash('sha256').update(`${timestamp}.${rawBody}`).digest();
    const key = this.webhookPublicKey.replace(/\\n/g, '\n');
    try {
      const verifier = createVerify('SHA256');
      verifier.update(Uint8Array.from(digest));
      verifier.end();
      return verifier.verify(key, signature, 'base64');
    } catch {
      return false;
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.apiKey) throw new Error('Bridge API key is not configured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Api-Key': this.apiKey,
      };
      // Bridge rejects Idempotency-Key on GET (and some resources).
      if (method !== 'GET' && method !== 'HEAD') {
        headers['Idempotency-Key'] = randomUUID();
      }
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          typeof (json as { message?: string }).message === 'string'
            ? (json as { message: string }).message
            : `Bridge request failed (${res.status})`;
        throw new Error(message);
      }
      return json as T;
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))) {
        throw new TimeoutError(`Bridge ${method} ${path}`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const bridgeLive = new BridgeClient(
  env.BRIDGE_API_KEY,
  env.BRIDGE_API_URL,
  env.BRIDGE_WEBHOOK_PUBLIC_KEY,
);

export const bridgeSandbox = new BridgeClient(
  env.BRIDGE_SANDBOX_API_KEY,
  env.BRIDGE_SANDBOX_API_URL,
  env.BRIDGE_SANDBOX_WEBHOOK_PUBLIC_KEY,
);
