'use client';

import { useCallback, useState } from 'react';
import {
  useCurrentAccount,
  useSignPersonalMessage,
} from '@mysten/dapp-kit';
import { useSatelliteConnectStore } from '@tuwaio/satellite-react';
import type { SolanaConnection } from '@tuwaio/satellite-solana';
import { useAccount, useSignTypedData } from 'wagmi';
import { Button } from '@/components/ui/button';
import { SuiWalletProvider } from '@/components/sui-wallet-provider';
import { MerchantWalletConnect } from '@/components/merchant-wallet-connect';
import * as api from '@/lib/api';
import {
  MERCHANT_CHAIN_FAMILY_LABELS,
  type MerchantChainFamily,
} from '@/lib/merchant-wallet-networks';
import { isActiveSolanaConnection, signSolanaMessageBytes } from '@/lib/solana-sign-message';

function useConnectedWallet(family: MerchantChainFamily): {
  address: string | null;
  solanaConnection?: SolanaConnection;
} {
  const { address: evmAddress } = useAccount();
  const activeConnection = useSatelliteConnectStore((state) => state.activeConnection);
  const suiAccount = useCurrentAccount();
  const solanaConnection = isActiveSolanaConnection(activeConnection) ? activeConnection : undefined;

  if (family === 'EVM') return { address: evmAddress ?? null };
  if (family === 'SOLANA') {
    return {
      address: solanaConnection?.address ? String(solanaConnection.address) : null,
      solanaConnection,
    };
  }
  return { address: suiAccount?.address ?? null };
}

function PayoutAuthorizeInner({
  token,
  appId,
  appName,
  appEnv,
  family,
  expectedWallet,
  onDone,
}: {
  token: string;
  appId: string;
  appName: string;
  appEnv: 'TEST' | 'PRODUCTION';
  family: MerchantChainFamily;
  expectedWallet: string;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { address, solanaConnection } = useConnectedWallet(family);
  const { signTypedDataAsync } = useSignTypedData();
  const { mutateAsync: signSuiMessage } = useSignPersonalMessage();

  const matches = Boolean(address && address.toLowerCase() === expectedWallet.toLowerCase());

  const authorize = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const prepared = await api.preparePayoutAuth(token, appId, family);
      let signature = '';

      if (family === 'EVM') {
        if (!prepared.typedData) throw new Error('Missing typed data');
        const td = prepared.typedData;
        signature = await signTypedDataAsync({
          domain: td.domain,
          types: td.types,
          primaryType: td.primaryType,
          message: {
            ...td.message,
            validUntil: BigInt(td.message.validUntil),
          },
        });
      } else if (family === 'SOLANA') {
        if (!solanaConnection) throw new Error('Connect the Solana payout wallet first');
        const raw = prepared.legacySessionMessageBase64
          ? Uint8Array.from(atob(prepared.legacySessionMessageBase64), (c) => c.charCodeAt(0))
          : new TextEncoder().encode(prepared.message ?? '');
        signature = await signSolanaMessageBytes(solanaConnection, raw);
      } else {
        const bytes = new TextEncoder().encode(prepared.message ?? '');
        const result = await signSuiMessage({ message: bytes });
        signature = result.signature;
      }

      await api.attachPayoutAuth(token, appId, {
        family,
        signature,
        validUntil: prepared.validUntil,
      });
      onDone();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'shortMessage' in err
          ? String((err as { shortMessage?: string }).shortMessage)
          : err instanceof Error
            ? err.message
            : 'Authorization failed';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [
    appId,
    family,
    onDone,
    signSuiMessage,
    signTypedDataAsync,
    solanaConnection,
    token,
  ]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Sign from {MERCHANT_CHAIN_FAMILY_LABELS[family]} wallet{' '}
        <span className="font-mono text-xs text-foreground">{expectedWallet}</span> to authorize
        NodeRails to execute payouts from this wallet (valid 1 year).
      </p>
      {!matches && (
        <div className="space-y-2">
          <p className="text-xs text-amber-800">
            Connect the payout wallet above, then sign. The connected address must match.
          </p>
          <MerchantWalletConnect
            appName={appName}
            appEnv={appEnv}
            walletType="payout"
            initialFamily={family}
            onVerified={async () => undefined}
          />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" disabled={saving || !matches} onClick={() => void authorize()}>
        {saving ? 'Signing…' : 'Sign payout authorization'}
      </Button>
    </div>
  );
}

export function PayoutAuthorize({
  token,
  appId,
  appName,
  appEnv,
  family,
  expectedWallet,
  onDone,
}: {
  token: string;
  appId: string;
  appName: string;
  appEnv: 'TEST' | 'PRODUCTION';
  family: MerchantChainFamily;
  expectedWallet: string;
  onDone: () => void;
}) {
  return (
    <SuiWalletProvider appEnv={appEnv}>
      <PayoutAuthorizeInner
        token={token}
        appId={appId}
        appName={appName}
        appEnv={appEnv}
        family={family}
        expectedWallet={expectedWallet}
        onDone={onDone}
      />
    </SuiWalletProvider>
  );
}

export function authExpiryLabel(validUntil?: string | Date | null): string | null {
  if (!validUntil) return null;
  const d = typeof validUntil === 'string' ? new Date(validUntil) : validUntil;
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return null;
  return d.toLocaleDateString();
}
