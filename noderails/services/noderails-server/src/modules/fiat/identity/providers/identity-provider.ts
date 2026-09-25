export interface IdentitySessionResult {
  externalId: string;
  url: string | null;
  status: string;
}

export interface IdentityProvider {
  readonly name: string;
  startSession(input: {
    kind: 'KYC' | 'KYB';
    vendorData: string;
    callback?: string;
  }): Promise<IdentitySessionResult>;
  getStatus(externalId: string): Promise<{ status: string }>;
  getSession(externalId: string): Promise<Record<string, unknown>>;
  verifyWebhook(rawBody: string, signature: string, timestamp: string): boolean;
}
