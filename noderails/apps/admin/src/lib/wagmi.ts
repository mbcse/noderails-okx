import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';
import { createConfig, http, type CreateConnectorFn } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { defineChain, type Chain } from 'viem';
import { getLeanRpcUrl } from '@noderails/common';

export interface WagmiChainInput {
  chainId: number;
  name: string;
  displayName?: string;
  nativeCurrencySymbol: string;
  isTestnet: boolean;
}

function toWagmiChain(chain: WagmiChainInput) {
  return defineChain({
    id: chain.chainId,
    name: chain.displayName ?? chain.name,
    nativeCurrency: {
      name: chain.nativeCurrencySymbol,
      symbol: chain.nativeCurrencySymbol,
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [getLeanRpcUrl(chain.chainId)] },
      public: { http: [getLeanRpcUrl(chain.chainId)] },
    },
    testnet: chain.isTestnet,
  });
}

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WC_PROJECT_ID?.trim()
  || process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim()
  || '';

function buildConnectors(): CreateConnectorFn[] {
  const connectors: CreateConnectorFn[] = [injected({ shimDisconnect: true })];
  if (walletConnectProjectId) {
    connectors.push(
      walletConnect({
        projectId: walletConnectProjectId,
        showQrModal: true,
      }) as CreateConnectorFn,
    );
  }
  connectors.push(
    coinbaseWallet({
      appName: 'NodeRails Admin',
    }) as CreateConnectorFn,
  );
  return connectors;
}

export function buildWagmiConfig(chainInputs: WagmiChainInput[]) {
  const mapped = chainInputs.length > 0 ? chainInputs.map(toWagmiChain) : [mainnet, sepolia];
  const chains = mapped as unknown as [Chain, ...Chain[]];

  return createConfig({
    chains,
    connectors: buildConnectors(),
    transports: Object.fromEntries(chains.map((chain) => [chain.id, http(getLeanRpcUrl(chain.id))])),
    ssr: true,
  });
}
