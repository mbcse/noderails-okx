import { indexerService } from '../services/indexer.js';
import { solanaIndexerService } from '../services/solana-indexer.js';
import { suiIndexerService } from '../services/sui-indexer.js';

export type ChainProtocol = 'evm' | 'solana' | 'sui';

export const CHAIN_PROTOCOLS = ['evm', 'solana', 'sui'] as const;

export function isNonEvmProtocol(protocol: string | null | undefined): boolean {
  return protocol === 'solana' || protocol === 'sui';
}

export function invalidateContractIndexerCache(
  protocol: string | null | undefined,
  chainId: number,
): void {
  if (protocol === 'solana') {
    solanaIndexerService.invalidateCache(chainId);
    return;
  }
  if (protocol === 'sui') {
    suiIndexerService.invalidateCache(chainId);
    return;
  }
  indexerService.invalidateCache(chainId);
}
