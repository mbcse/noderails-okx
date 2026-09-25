import { createPublicClient, http, type Address, type Hex } from 'viem';
import { nodeRailsEscrowAbi } from '@noderails/web3';
import { getLeanRpcUrl } from '@noderails/common';

export async function readEscrowSettleAmount(
  escrowAddress: Address,
  chainId: number,
  paymentIntentId: Hex,
): Promise<bigint> {
  const rpc = createPublicClient({ transport: http(getLeanRpcUrl(chainId)) });
  return rpc.readContract({
    address: escrowAddress,
    abi: nodeRailsEscrowAbi,
    functionName: 'settleAmount',
    args: [paymentIntentId],
  });
}
