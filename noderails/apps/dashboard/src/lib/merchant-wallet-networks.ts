import type { WagmiChainInput } from '@/lib/wagmi';
import { merchantReceiveAddress } from '@noderails/common';

export type MerchantChainFamily = 'EVM' | 'SOLANA' | 'SUI';

export const ALL_MERCHANT_FAMILIES: MerchantChainFamily[] = ['EVM', 'SOLANA', 'SUI'];

/** Merchant dashboard payouts are EVM-only until Solana/Sui execute ships. */
export const PAYOUT_DASHBOARD_FAMILIES: MerchantChainFamily[] = ['EVM'];

export function isEvmChainType(chainType?: string | null): boolean {
  return !chainType || chainType === 'EVM';
}

/** Default NodeRails chain ids for merchant wallet connect by app environment. */
export const MERCHANT_WALLET_CHAIN_IDS: Record<
  MerchantChainFamily,
  { TEST: number; PRODUCTION: number }
> = {
  EVM: { TEST: 11155111, PRODUCTION: 1 },
  SOLANA: { TEST: 102, PRODUCTION: 103 },
  SUI: { TEST: 201, PRODUCTION: 203 },
};

export function merchantChainId(
  family: MerchantChainFamily,
  appEnv: 'TEST' | 'PRODUCTION',
): number {
  return MERCHANT_WALLET_CHAIN_IDS[family][appEnv];
}

/** Static chain list for Satellite / wagmi bootstrap on the merchant dashboard. */
export function defaultMerchantWalletChains(): WagmiChainInput[] {
  return [
    {
      chainId: 1,
      name: 'Ethereum',
      nativeCurrencySymbol: 'ETH',
      isTestnet: false,
      chainType: 'EVM',
    },
    {
      chainId: 11155111,
      name: 'Sepolia',
      nativeCurrencySymbol: 'ETH',
      isTestnet: true,
      chainType: 'EVM',
    },
    {
      chainId: 102,
      name: 'Solana Devnet',
      nativeCurrencySymbol: 'SOL',
      isTestnet: true,
      chainType: 'SOLANA',
    },
    {
      chainId: 103,
      name: 'Solana Mainnet',
      nativeCurrencySymbol: 'SOL',
      isTestnet: false,
      chainType: 'SOLANA',
    },
    {
      chainId: 201,
      name: 'Sui Devnet',
      nativeCurrencySymbol: 'SUI',
      isTestnet: true,
      chainType: 'SUI',
    },
    {
      chainId: 203,
      name: 'Sui Mainnet',
      nativeCurrencySymbol: 'SUI',
      isTestnet: false,
      chainType: 'SUI',
    },
  ];
}

export const MERCHANT_CHAIN_FAMILY_LABELS: Record<MerchantChainFamily, string> = {
  EVM: 'EVM',
  SOLANA: 'Solana',
  SUI: 'Sui',
};

export function chainRowFamily(row: {
  chainType?: string;
  chain?: { chainType?: string };
}): MerchantChainFamily {
  const raw = row.chain?.chainType ?? row.chainType ?? 'EVM';
  if (raw === 'SOLANA' || raw === 'SUI') return raw;
  return 'EVM';
}

export function receiveAddressForAppChain(
  row: { settlementAddress?: string | null; chainType?: string; chain?: { chainType?: string } },
  receivingWallet?: string | null,
): string | null {
  return merchantReceiveAddress(chainRowFamily(row), row.settlementAddress, receivingWallet);
}

export function chainsMissingReceive(
  appChains: {
    name?: string;
    settlementAddress?: string | null;
    chainType?: string;
    chain?: { name?: string; displayName?: string; chainType?: string };
  }[],
  receivingWallet?: string | null,
): { name: string; family: MerchantChainFamily }[] {
  return appChains
    .filter((row) => !receiveAddressForAppChain(row, receivingWallet))
    .map((row) => ({
      name: row.chain?.displayName ?? row.chain?.name ?? row.name ?? 'This network',
      family: chainRowFamily(row),
    }));
}
