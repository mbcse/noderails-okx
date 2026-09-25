import type { Environment } from '@noderails/database';
import { diditLive, diditSandbox } from '../../clients/didit.client.js';
import { bridgeLive, bridgeSandbox } from '../../clients/bridge.client.js';
import { DiditIdentityProvider } from './identity/providers/didit.identity.js';
import type { IdentityProvider } from './identity/providers/identity-provider.js';
import { BridgeVaProvider } from './virtual-accounts/providers/bridge.va.js';
import type { VirtualAccountProvider } from './virtual-accounts/providers/va-provider.js';
import { bloxfiOfframp } from './own-accounts/providers/bloxfi.offramp.js';
import type { OfframpBeneficiaryProvider } from './own-accounts/providers/offramp-provider.js';

const diditLiveProvider = new DiditIdentityProvider(diditLive);
const diditSandboxProvider = new DiditIdentityProvider(diditSandbox);
const bridgeLiveProvider = new BridgeVaProvider(bridgeLive, 'live');
const bridgeSandboxProvider = new BridgeVaProvider(bridgeSandbox, 'sandbox');

export function getIdentityProvider(environment: Environment): IdentityProvider {
  return environment === 'PRODUCTION' ? diditLiveProvider : diditSandboxProvider;
}

export function getVaProvider(environment: Environment): VirtualAccountProvider {
  return environment === 'PRODUCTION' ? bridgeLiveProvider : bridgeSandboxProvider;
}

export function getOfframpProvider(): OfframpBeneficiaryProvider {
  return bloxfiOfframp;
}
