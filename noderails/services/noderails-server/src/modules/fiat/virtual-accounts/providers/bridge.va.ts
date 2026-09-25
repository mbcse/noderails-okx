import type { BridgeClient } from '../../../../clients/bridge.client.js';
import { ALL_BRIDGE_ENDORSEMENTS, bridgePaymentRail, railMeta } from '../../rails.js';
import type {
  VaAccount,
  VaActivityEvent,
  VaCustomerKyc,
  VirtualAccountProvider,
} from './va-provider.js';

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mapEndorsements(raw: unknown): Array<{ name: string; status: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const item = row as { name?: string; status?: string };
    return { name: String(item.name ?? ''), status: String(item.status ?? '') };
  });
}

function mapKycStatus(raw: Record<string, unknown>): string {
  const nested = raw.kyc && typeof raw.kyc === 'object' && !Array.isArray(raw.kyc)
    ? raw.kyc as Record<string, unknown>
    : {};
  for (const value of [raw.kyc_status, raw.kycStatus, nested.status, raw.verification_status]) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  // Bridge customer.status is often "active", not a KYC decision.
  return 'not_started';
}

function mapCustomer(raw: Record<string, unknown>, fallbackId?: string | null): VaCustomerKyc {
  return {
    externalCustomerId: asString(raw.id) ?? asString(raw.customer_id) ?? fallbackId ?? null,
    kycLink: asString(raw.kyc_link),
    tosLink: asString(raw.tos_link),
    kycStatus: mapKycStatus(raw),
    tosStatus: String(raw.tos_status ?? ''),
    endorsements: mapEndorsements(raw.endorsements),
  };
}

function mapActivity(row: Record<string, unknown>): VaActivityEvent {
  const source = (row.source && typeof row.source === 'object')
    ? row.source as Record<string, unknown>
    : null;
  return {
    externalEventId: String(row.id ?? ''),
    depositId: asString(row.deposit_id),
    type: String(row.type ?? ''),
    amount: asString(row.amount),
    currency: asString(row.currency),
    paymentRail: asString(source?.payment_rail) ?? asString(row.payment_rail),
    senderName: asString(source?.sender_name) ?? asString(source?.originator_name),
    senderReference: asString(source?.reference) ?? asString(source?.description) ?? asString(source?.wire_message),
    senderLast4: asString(source?.last_4) ?? asString(source?.iban_last_4),
    developerFee: asString(row.developer_fee_amount),
    exchangeFee: asString(row.exchange_fee_amount),
    gasFee: asString(row.gas_fee),
    subtotal: asString(row.subtotal_amount),
    destinationTxHash: asString(row.destination_tx_hash),
    receipt: row.receipt && typeof row.receipt === 'object' ? row.receipt as Record<string, unknown> : null,
    source,
  };
}

export class BridgeVaProvider implements VirtualAccountProvider {
  readonly name = 'bridge';

  constructor(
    private readonly client: BridgeClient,
    private readonly mode: 'live' | 'sandbox',
  ) {}

  async startCustomerKyc(input: {
    type: 'individual' | 'business';
    fullName: string;
    email: string;
    redirectUri?: string;
  }): Promise<VaCustomerKyc> {
    if (this.mode === 'sandbox') {
      const [firstName, ...rest] = input.fullName.trim().split(/\s+/);
      const customer = await this.client.createCustomer({
        type: input.type,
        first_name: firstName || 'Test',
        last_name: rest.join(' ') || 'Merchant',
        email: input.email,
        signed_agreement_id: crypto.randomUUID(),
      });
      return mapCustomer(customer);
    }
    const link = await this.client.createKycLink({
      full_name: input.fullName,
      email: input.email,
      type: input.type,
      endorsements: ALL_BRIDGE_ENDORSEMENTS,
      redirect_uri: input.redirectUri,
    });
    return mapCustomer(link);
  }

  async getCustomer(externalCustomerId: string): Promise<VaCustomerKyc> {
    const customer = await this.client.getCustomer(externalCustomerId);
    return mapCustomer(customer, externalCustomerId);
  }

  async simulateKycApproval(externalCustomerId: string): Promise<VaCustomerKyc> {
    if (this.mode !== 'sandbox') {
      throw new Error('KYC simulation is only available in TEST');
    }
    const raw = await this.client.simulateKycApproval(externalCustomerId);
    let latest: Record<string, unknown> = raw;
    try {
      latest = await this.client.getCustomer(externalCustomerId);
    } catch {
      latest = raw;
    }
    const mapped = mapCustomer(latest, externalCustomerId);
    if (mapped.kycStatus.toLowerCase().includes('reject')) return mapped;
    // Sandbox GET can lag the simulate POST. A successful simulate means approved.
    return { ...mapped, kycStatus: 'approved' };
  }

  async createAccount(input: {
    externalCustomerId: string;
    rail: string;
    destinationAddress: string;
    destinationChainId: number;
    destinationToken: string;
  }): Promise<VaAccount> {
    const meta = railMeta(input.rail);
    const created = await this.client.createVirtualAccount(input.externalCustomerId, {
      source: { currency: meta?.currency.toLowerCase() ?? input.rail },
      destination: {
        payment_rail: bridgePaymentRail(input.destinationChainId),
        currency: input.destinationToken.toLowerCase().startsWith('usdc') ? 'usdc' : 'usdc',
        address: input.destinationAddress,
      },
    });
    const instructions = (created.source_deposit_instructions && typeof created.source_deposit_instructions === 'object')
      ? created.source_deposit_instructions as Record<string, unknown>
      : {};
    return {
      externalAccountId: String(created.id ?? ''),
      externalCustomerId: String(created.customer_id ?? input.externalCustomerId),
      rail: input.rail,
      status: String(created.status ?? 'activated'),
      depositInstructions: {
        ...instructions,
        currency: asString(instructions.currency) ?? meta?.currency ?? input.rail.toUpperCase(),
        payment_rail: asString(instructions.payment_rail) ?? meta?.endorsement ?? input.rail,
      },
    };
  }

  async listActivity(externalCustomerId: string, externalAccountId: string): Promise<VaActivityEvent[]> {
    const history = await this.client.getVirtualAccountHistory(externalCustomerId, externalAccountId);
    const rows = Array.isArray(history.data) ? history.data : [];
    return rows.map((row) => mapActivity(row));
  }
}
