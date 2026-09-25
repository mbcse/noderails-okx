import { createHmac } from 'node:crypto';
import { timingSafeEqual } from '@noderails/common';
import { env } from '../config.js';

const DIDIT_TIMEOUT_MS = 20_000;
const DIDIT_TIMESTAMP_SKEW_SEC = 300;

export interface DiditSession {
  session_id?: string;
  sessionId?: string;
  url?: string;
  session_url?: string;
  status?: string;
  [key: string]: unknown;
}

function shortenFloats(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shortenFloats);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = shortenFloats(v);
    }
    return out;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value === Math.trunc(value)) {
    return Math.trunc(value);
  }
  return value;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export class DiditClient {
  constructor(
    private readonly apiKey: string,
    private readonly workflowKyc: string,
    private readonly workflowKyb: string,
    private readonly webhookSecret: string,
    private readonly baseUrl = env.DIDIT_API_URL.replace(/\/$/, ''),
  ) {}

  workflowId(kind: 'KYC' | 'KYB'): string {
    return kind === 'KYB' ? this.workflowKyb : this.workflowKyc;
  }

  async createSession(input: {
    workflowId: string;
    vendorData: string;
    callback?: string;
  }): Promise<DiditSession> {
    return this.request<DiditSession>('POST', '/v3/session/', {
      workflow_id: input.workflowId,
      vendor_data: input.vendorData,
      callback: input.callback,
    });
  }

  async getSession(sessionId: string): Promise<DiditSession> {
    return this.request<DiditSession>('GET', `/v3/session/${sessionId}/`);
  }

  verifyWebhook(rawBody: string, signatureV2: string, timestamp: string): boolean {
    if (!this.webhookSecret || !signatureV2 || !timestamp) return false;
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(Date.now() / 1000 - ts) > DIDIT_TIMESTAMP_SKEW_SEC) return false;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return false;
    }
    const canonical = JSON.stringify(sortKeys(shortenFloats(parsed)));
    const expected = createHmac('sha256', this.webhookSecret).update(canonical, 'utf8').digest('hex');
    return timingSafeEqual(expected, signatureV2);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.apiKey) throw new Error('Didit API key is not configured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DIDIT_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof (json as { detail?: string }).detail === 'string'
          ? (json as { detail: string }).detail
          : `Didit request failed (${res.status})`;
        throw new Error(message);
      }
      return json as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const diditLive = new DiditClient(
  env.DIDIT_API_KEY,
  env.DIDIT_WORKFLOW_KYC,
  env.DIDIT_WORKFLOW_KYB,
  env.DIDIT_WEBHOOK_SECRET,
);

export const diditSandbox = new DiditClient(
  env.DIDIT_SANDBOX_API_KEY,
  env.DIDIT_SANDBOX_WORKFLOW_KYC,
  env.DIDIT_SANDBOX_WORKFLOW_KYB,
  env.DIDIT_SANDBOX_WEBHOOK_SECRET,
);
