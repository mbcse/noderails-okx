import type { DiditClient } from '../../../../clients/didit.client.js';
import type { IdentityProvider, IdentitySessionResult } from './identity-provider.js';

export class DiditIdentityProvider implements IdentityProvider {
  readonly name = 'didit';

  constructor(private readonly client: DiditClient) {}

  async startSession(input: {
    kind: 'KYC' | 'KYB';
    vendorData: string;
    callback?: string;
  }): Promise<IdentitySessionResult> {
    const session = await this.client.createSession({
      workflowId: this.client.workflowId(input.kind),
      vendorData: input.vendorData,
      callback: input.callback,
    });
    const externalId = String(session.session_id ?? session.sessionId ?? '');
    const url = typeof session.url === 'string'
      ? session.url
      : typeof session.session_url === 'string'
        ? session.session_url
        : null;
    return {
      externalId,
      url,
      status: String(session.status ?? 'Not Started'),
    };
  }

  async getStatus(externalId: string): Promise<{ status: string }> {
    const session = await this.getSession(externalId);
    return { status: String(session.status ?? 'Unknown') };
  }

  async getSession(externalId: string): Promise<Record<string, unknown>> {
    return this.client.getSession(externalId) as Promise<Record<string, unknown>>;
  }

  verifyWebhook(rawBody: string, signature: string, timestamp: string): boolean {
    return this.client.verifyWebhook(rawBody, signature, timestamp);
  }
}
