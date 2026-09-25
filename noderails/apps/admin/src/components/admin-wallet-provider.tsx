'use client';

import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SatelliteConnectProvider } from '@tuwaio/satellite-react';
import { EVMConnectorsWatcher } from '@tuwaio/satellite-react/evm';
import { satelliteEVMAdapter } from '@tuwaio/satellite-evm';
import type { Chain } from 'viem';
import { WagmiProvider } from 'wagmi';
import { buildWagmiConfig, type WagmiChainInput } from '@/lib/wagmi';

const queryClient = new QueryClient();

export type AdminWagmiChainInput = WagmiChainInput;

export function AdminWalletProvider({
  chainInputs,
  children,
}: {
  chainInputs: AdminWagmiChainInput[];
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const wagmiConfig = useMemo(() => buildWagmiConfig(chainInputs), [chainInputs]);
  const adapters = useMemo(
    () => [satelliteEVMAdapter(wagmiConfig, wagmiConfig.chains as readonly [Chain, ...Chain[]])],
    [wagmiConfig],
  );

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SatelliteConnectProvider adapter={adapters as never} autoConnect={false}>
          <EVMConnectorsWatcher wagmiConfig={wagmiConfig} />
          {children}
        </SatelliteConnectProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
