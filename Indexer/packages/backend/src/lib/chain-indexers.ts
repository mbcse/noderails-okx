import { indexerService } from '../services/indexer.js';
import { nativeIndexerService } from '../services/native-indexer.js';
import { solanaIndexerService } from '../services/solana-indexer.js';
import { suiIndexerService } from '../services/sui-indexer.js';
import { suiNativeIndexerService } from '../services/sui-native-indexer.js';

export async function startChainIndexers(protocol: string, chainId: number): Promise<void> {
  if (protocol === 'solana') {
    solanaIndexerService.startChainLoop(chainId);
    return;
  }
  if (protocol === 'sui') {
    suiIndexerService.startChainLoop(chainId);
    suiNativeIndexerService.startChainLoop(chainId);
    return;
  }
  indexerService.startChainLoop(chainId);
  nativeIndexerService.startChainLoop(chainId);
}

export async function stopChainIndexers(protocol: string, chainId: number): Promise<void> {
  if (protocol === 'solana') {
    await solanaIndexerService.stopChainLoop(chainId);
    return;
  }
  if (protocol === 'sui') {
    await suiIndexerService.stopChainLoop(chainId);
    await suiNativeIndexerService.stopChainLoop(chainId);
    return;
  }
  await indexerService.stopChainLoop(chainId);
  await nativeIndexerService.stopChainLoop(chainId);
}

export async function ensureChainIndexersRunning(
  protocol: string,
  chainId: number,
  isActive: boolean,
): Promise<void> {
  if (!isActive) return;
  await startChainIndexers(protocol, chainId);
}
