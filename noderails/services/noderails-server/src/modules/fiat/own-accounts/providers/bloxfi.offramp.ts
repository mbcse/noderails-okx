import { bloxFiClient } from '../../../../clients/bloxfi.client.js';
import type { OfframpBeneficiaryProvider } from './offramp-provider.js';

export class BloxFiOfframpProvider implements OfframpBeneficiaryProvider {
  readonly name = 'bloxfi';

  async create(body: Record<string, unknown>): Promise<{ id: string }> {
    return bloxFiClient.createBeneficiary(body);
  }
}

export const bloxfiOfframp = new BloxFiOfframpProvider();
