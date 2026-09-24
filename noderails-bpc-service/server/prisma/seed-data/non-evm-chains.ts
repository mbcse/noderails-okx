import { getFullnodeUrl } from '@mysten/sui/client';
import type { SeedChain } from './chainlist-loader.js';

/** NodeRails Solana + Sui chain IDs (not in chainlist.org). */
export function getNonEvmChains(): SeedChain[] {
  return [
    {
      chainId: 101,
      chainType: 'SOLANA',
      name: 'solana-testnet',
      displayName: 'Solana Testnet',
      nativeCurrencySymbol: 'SOL',
      nativeCurrencyDecimals: 9,
      explorerUrl: 'https://solscan.io',
      coingeckoPlatformId: 'solana',
      isTestnet: true,
      rpcUrls: [
        'https://api.testnet.solana.com',
        'https://rpc.ankr.com/solana_testnet',
      ],
    },
    {
      chainId: 102,
      chainType: 'SOLANA',
      name: 'solana-devnet',
      displayName: 'Solana Devnet',
      nativeCurrencySymbol: 'SOL',
      nativeCurrencyDecimals: 9,
      explorerUrl: 'https://solscan.io',
      coingeckoPlatformId: 'solana',
      isTestnet: true,
      rpcUrls: [
        'https://api.devnet.solana.com',
        'https://rpc.ankr.com/solana_devnet',
      ],
    },
    {
      chainId: 103,
      chainType: 'SOLANA',
      name: 'solana',
      displayName: 'Solana',
      nativeCurrencySymbol: 'SOL',
      nativeCurrencyDecimals: 9,
      explorerUrl: 'https://solscan.io',
      coingeckoPlatformId: 'solana',
      isTestnet: false,
      rpcUrls: [
        'https://api.mainnet-beta.solana.com',
        'https://rpc.ankr.com/solana',
        'https://solana-mainnet.rpc.extrnode.com',
        'https://solana.public-rpc.com',
      ],
    },
    {
      chainId: 201,
      chainType: 'SUI',
      name: 'sui-devnet',
      displayName: 'Sui Devnet',
      nativeCurrencySymbol: 'SUI',
      nativeCurrencyDecimals: 9,
      explorerUrl: 'https://suiscan.xyz/devnet',
      coingeckoPlatformId: 'sui',
      isTestnet: true,
      rpcUrls: [
        'https://sui-devnet-rpc.publicnode.com',
        'https://rpc-devnet.suiscan.xyz',
        getFullnodeUrl('devnet'),
      ],
    },
    {
      chainId: 202,
      chainType: 'SUI',
      name: 'sui-testnet',
      displayName: 'Sui Testnet',
      nativeCurrencySymbol: 'SUI',
      nativeCurrencyDecimals: 9,
      explorerUrl: 'https://suiscan.xyz/testnet',
      coingeckoPlatformId: 'sui',
      isTestnet: true,
      rpcUrls: [
        'https://sui-testnet-rpc.publicnode.com',
        'https://rpc-testnet.suiscan.xyz',
      ],
    },
    {
      chainId: 203,
      chainType: 'SUI',
      name: 'sui',
      displayName: 'Sui',
      nativeCurrencySymbol: 'SUI',
      nativeCurrencyDecimals: 9,
      explorerUrl: 'https://suiscan.xyz/mainnet',
      coingeckoPlatformId: 'sui',
      isTestnet: false,
      rpcUrls: [
        getFullnodeUrl('mainnet'),
        'https://sui-mainnet-rpc.publicnode.com',
        'https://sui-mainnet.nodeinfra.com',
        'https://sui-mainnet.public.blastapi.io',
      ],
    },
  ];
}
