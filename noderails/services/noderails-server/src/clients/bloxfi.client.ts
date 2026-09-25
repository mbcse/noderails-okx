import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config.js';

const WEBHOOK_SKEW_MS = 5 * 60 * 1000;

export interface BloxFiRate {
  bfxToken: string;
  sourceAmount?: string;
  destinationAmount?: string;
  rate?: string;
  payoutCurrency?: string;
}

export interface BloxFiDepositInfo {
  address?: string;
  chain?: string;
  token?: string;
  amount?: string;
  memo?: string;
}

export interface BloxFiTransfer {
  id: string;
  status?: string;
  clientReferenceId?: string;
  depositInfo?: BloxFiDepositInfo;
  [key: string]: unknown;
}

export class BloxFiClient {
  constructor(
    private readonly apiKey = env.BLOXFI_API_KEY,
    private readonly baseUrl = env.BLOXFI_BASE_URL.replace(/\/$/, ''),
    private readonly timeoutMs = env.BLOXFI_TIMEOUT_MS,
    private readonly webhookSecret = env.BLOXFI_WEBHOOK_SECRET,
  ) {}

  async listCorridors(): Promise<unknown> {
    return this.request('GET', '/v1/catalog/corridors');
  }

  async getOfframpRate(input: {
    sourceCurrency: string;
    destinationCurrency: string;
    amount: string;
    network?: string;
  }): Promise<BloxFiRate> {
    const search = new URLSearchParams({
      direction: 'off-ramp',
      sourceCurrency: input.sourceCurrency,
      destinationCurrency: input.destinationCurrency,
      amount: input.amount,
    });
    if (input.network) search.set('network', input.network);
    return this.request<BloxFiRate>('GET', `/v1/catalog/rate?${search.toString()}`);
  }

  async createBeneficiary(body: Record<string, unknown>): Promise<{ id: string }> {
    return this.request<{ id: string }>('POST', '/v1/beneficiaries', body);
  }

  async createOfframpTransfer(input: {
    clientReferenceId: string;
    beneficiaryId: string;
    bfxToken: string;
    amount: string;
    sourceCurrency: string;
    destinationCurrency: string;
    network?: string;
  }): Promise<BloxFiTransfer> {
    return this.request<BloxFiTransfer>('POST', '/v1/transfers/offramp', input);
  }

  async getTransfer(transferId: string): Promise<BloxFiTransfer> {
    return this.request<BloxFiTransfer>('GET', `/v1/transfers/${transferId}`);
  }

  verifyWebhookSignature(rawBody: string, signature: string, timestamp: string): boolean {
    if (!this.webhookSecret || !signature || !timestamp) return false;
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(Date.now() - ts) > WEBHOOK_SKEW_MS) return false;
    const expected = createHmac('sha256', this.webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    const a = new Uint8Array(Buffer.from(expected, 'utf8'));
    const b = new Uint8Array(Buffer.from(signature.trim().toLowerCase(), 'utf8'));
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.apiKey) {
      throw new Error('BLOXFI_API_KEY is not configured');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json()) as T & { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(json.message ?? json.error ?? `BloxFi error ${res.status}`);
      }
      return json;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const bloxFiClient = new BloxFiClient();
