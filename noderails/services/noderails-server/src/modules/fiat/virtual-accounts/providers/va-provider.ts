export interface VaCustomerKyc {
  externalCustomerId: string | null;
  kycLink: string | null;
  tosLink: string | null;
  kycStatus: string;
  tosStatus: string;
  endorsements: Array<{ name: string; status: string }>;
}

export interface VaAccount {
  externalAccountId: string;
  externalCustomerId: string;
  rail: string;
  status: string;
  depositInstructions: Record<string, unknown>;
}

export interface VaActivityEvent {
  externalEventId: string;
  depositId: string | null;
  type: string;
  amount: string | null;
  currency: string | null;
  paymentRail: string | null;
  senderName: string | null;
  senderReference: string | null;
  senderLast4: string | null;
  developerFee: string | null;
  exchangeFee: string | null;
  gasFee: string | null;
  subtotal: string | null;
  destinationTxHash: string | null;
  receipt: Record<string, unknown> | null;
  source: Record<string, unknown> | null;
}

export interface VirtualAccountProvider {
  readonly name: string;
  startCustomerKyc(input: {
    type: 'individual' | 'business';
    fullName: string;
    email: string;
    redirectUri?: string;
  }): Promise<VaCustomerKyc>;
  getCustomer(externalCustomerId: string): Promise<VaCustomerKyc>;
  simulateKycApproval(externalCustomerId: string): Promise<VaCustomerKyc>;
  createAccount(input: {
    externalCustomerId: string;
    rail: string;
    destinationAddress: string;
    destinationChainId: number;
    destinationToken: string;
  }): Promise<VaAccount>;
  listActivity(externalCustomerId: string, externalAccountId: string): Promise<VaActivityEvent[]>;
}
