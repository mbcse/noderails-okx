'use client';

import {
  OrbitAdapter,
  formatConnectorName,
  getAdapterFromConnectorType,
  getConnectorTypeFromName,
  type ConnectorType,
} from '@tuwaio/orbit-core';
import { useSatelliteConnectStore } from '@tuwaio/satellite-react';
import { useAccount, useConnectors, useDisconnect } from 'wagmi';
import { Badge, Button } from '@/components/ui';

export function AdminSatelliteConnect({ chainId }: { chainId: number | null }) {
  const { address, isConnected } = useAccount();
  const evmConnectors = useConnectors();
  const { disconnect: disconnectWagmi } = useDisconnect();
  const connect = useSatelliteConnectStore((state) => state.connect);
  const disconnectSatellite = useSatelliteConnectStore((state) => state.disconnect);
  const connecting = useSatelliteConnectStore((state) => state.connecting);
  const activeConnection = useSatelliteConnectStore((state) => state.activeConnection);
  const connectionError = useSatelliteConnectStore((state) => state.connectionError);

  const evmConnected =
    activeConnection?.isConnected
    && getAdapterFromConnectorType(activeConnection.connectorType) === OrbitAdapter.EVM;

  const handleDisconnect = async () => {
    disconnectWagmi();
    if (activeConnection?.isConnected) {
      await disconnectSatellite(activeConnection.connectorType);
    }
  };

  if (isConnected || evmConnected) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{address?.slice(0, 6)}…{address?.slice(-4)}</Badge>
        <Button variant="secondary" onClick={() => void handleDisconnect()}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-2">
      <p className="text-xs font-medium text-[#697386]">Connect admin wallet</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {evmConnectors.map((connector) => (
          <button
            key={connector.uid}
            type="button"
            disabled={connecting}
            onClick={() => {
              void connect({
                connectorType: getConnectorTypeFromName(
                  OrbitAdapter.EVM,
                  formatConnectorName(connector.name),
                ) as ConnectorType,
                chainId: chainId ?? 1,
              });
            }}
            className="flex h-auto min-h-[2.75rem] items-center justify-between gap-2 rounded-lg border border-[#e3e8ee] bg-white px-3 py-2 text-left text-sm font-medium text-[#0a2540] hover:border-[#635bff]/40 disabled:opacity-60"
          >
            <span className="truncate">{connector.name}</span>
            {connector.ready ? (
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#097c43]" />
            ) : null}
          </button>
        ))}
      </div>
      {connecting && <p className="text-xs text-[#697386]">Connecting…</p>}
      {connectionError?.message && (
        <p className="text-xs text-[#df1b41]">{connectionError.message}</p>
      )}
    </div>
  );
}
