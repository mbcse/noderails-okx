'use client';

import { getAdapterFromConnectorType, OrbitAdapter } from '@tuwaio/orbit-core';
import { useSatelliteConnectStore } from '@tuwaio/satellite-react';
import { Wallet } from 'lucide-react';
import { useAccount, useDisconnect } from 'wagmi';
import { Button } from '@/components/ui/button';
import { MerchantSatelliteWalletGrid } from '@/components/merchant-wallet-connect';
import { sameEvmAddress, shortWallet } from './payouts-types';

export function payoutWalletReady(
  connectedAddress?: string | null,
  payoutWallet?: string | null,
): boolean {
  return sameEvmAddress(connectedAddress, payoutWallet);
}

export function PayoutWalletSession({
  appEnv,
  payoutWallet,
}: {
  appEnv: 'TEST' | 'PRODUCTION';
  payoutWallet?: string | null;
}) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const satelliteDisconnect = useSatelliteConnectStore((state) => state.disconnect);
  const activeConnection = useSatelliteConnectStore((state) => state.activeConnection);

  const handleDisconnect = async () => {
    disconnect();
    if (
      activeConnection?.isConnected &&
      getAdapterFromConnectorType(activeConnection.connectorType) === OrbitAdapter.EVM
    ) {
      await satelliteDisconnect(activeConnection.connectorType);
    }
  };

  if (!payoutWallet) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Save a payout wallet in Settings → Wallets first.
      </p>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Wallet className="h-3.5 w-3.5 shrink-0" />
          Connect {shortWallet(payoutWallet)} to approve or deposit.
        </p>
        <MerchantSatelliteWalletGrid family="EVM" appEnv={appEnv} />
      </div>
    );
  }

  const matches = sameEvmAddress(address, payoutWallet);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-mono text-[13px] text-foreground" title={address}>
          {shortWallet(address)}
        </p>
        {matches ? (
          <p className="text-[12px] text-muted-foreground">Payout wallet connected</p>
        ) : (
          <p className="text-[12px] text-destructive">
            Switch to {shortWallet(payoutWallet)} in your wallet.
          </p>
        )}
      </div>
      <Button type="button" size="sm" variant="ghost" onClick={() => void handleDisconnect()}>
        Disconnect
      </Button>
    </div>
  );
}
