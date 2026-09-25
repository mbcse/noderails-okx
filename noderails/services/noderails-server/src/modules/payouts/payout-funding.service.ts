import { getDatabaseClient, ChainType } from '@noderails/database';
import { NotFoundError, AuthorizationError, ValidationError, isNativeToken } from '@noderails/common';
import { createLogger } from '@noderails/service-base';
import { createPublicClient, http, erc20Abi, type Address } from 'viem';
import * as balanceService from '../balance/balance.service.js';
import { familyPayoutWallet, type PayoutAuthFamily } from './payout-auth.service.js';

const logger = createLogger('payout-funding');

const MERCHANT_ETH_BALANCE_ABI = [
  {
    type: 'function',
    name: 'merchantETHBalance',
    stateMutability: 'view',
    inputs: [{ name: 'merchantWallet', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

function familyOf(chainType: ChainType): PayoutAuthFamily {
  if (chainType === ChainType.SOLANA) return 'SOLANA';
  if (chainType === ChainType.SUI) return 'SUI';
  return 'EVM';
}

async function evmClient(rpcUrl: string) {
  return createPublicClient({ transport: http(rpcUrl) });
}

export async function getPayoutFunding(merchantId: string, appId: string, chainId: number) {
  const db = getDatabaseClient();
  const app = await db.app.findUnique({ where: { id: appId } });
  if (!app) throw new NotFoundError('App', appId);
  if (app.merchantId !== merchantId) throw new AuthorizationError('Access denied');

  const chain = await db.supportedChain.findUnique({ where: { chainId } });
  if (!chain?.isEnabled) throw new ValidationError(`Chain ${chainId} is not available`);

  const family = familyOf(chain.chainType);
  const wallet = familyPayoutWallet(app, family);
  if (!wallet) {
    throw new ValidationError(`Configure a ${family} payout wallet first`);
  }

  const appTokens = await db.appToken.findMany({
    where: { appId, isEnabled: true, supportedToken: { chainId, isEnabled: true } },
    include: { supportedToken: true },
  });

  let walletNative: { balanceRaw: string; balanceFormatted: string; decimals: number; symbol: string } | null = null;
  try {
    const native = await balanceService.getWalletBalance(
      { chainId, address: wallet, token: 'native' },
      logger,
    );
    walletNative = {
      balanceRaw: native.balanceRaw,
      balanceFormatted: native.balanceFormatted,
      decimals: native.decimals,
      symbol: native.symbol,
    };
  } catch (err) {
    logger.warn('BPC native balance failed', { chainId, error: String(err) });
  }

  let merchantManagerEth: string | null = null;
  const tokens: Array<{
    tokenId: string;
    tokenKey: string;
    symbol: string;
    contractAddress: string;
    decimals: number;
    balanceRaw: string | null;
    balanceFormatted: string | null;
    allowanceRaw: string | null;
  }> = [];

  if (family === 'EVM' && chain.rpcUrl && chain.merchantManagerAddress) {
    const client = await evmClient(chain.rpcUrl);
    try {
      const deposited = await client.readContract({
        address: chain.merchantManagerAddress as Address,
        abi: MERCHANT_ETH_BALANCE_ABI,
        functionName: 'merchantETHBalance',
        args: [wallet as Address],
      });
      merchantManagerEth = deposited.toString();
    } catch (err) {
      logger.warn('merchantETHBalance read failed', { chainId, error: String(err) });
    }

    if (!walletNative) {
      try {
        const wei = await client.getBalance({ address: wallet as Address });
        walletNative = {
          balanceRaw: wei.toString(),
          balanceFormatted: (Number(wei) / 1e18).toString(),
          decimals: 18,
          symbol: 'ETH',
        };
      } catch (err) {
        logger.warn('wallet ETH balance read failed', { chainId, error: String(err) });
      }
    }

    for (const row of appTokens) {
      const tok = row.supportedToken;
      if (isNativeToken(tok.contractAddress)) continue;
      let balanceRaw: string | null = null;
      let balanceFormatted: string | null = null;
      let allowanceRaw: string | null = null;
      try {
        const bpc = await balanceService.getWalletBalance(
          { chainId, address: wallet, token: tok.contractAddress },
          logger,
        );
        balanceRaw = bpc.balanceRaw;
        balanceFormatted = bpc.balanceFormatted;
      } catch {
        try {
          const bal = await client.readContract({
            address: tok.contractAddress as Address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [wallet as Address],
          });
          balanceRaw = bal.toString();
        } catch (err) {
          logger.warn('token balance read failed', { token: tok.tokenKey, error: String(err) });
        }
      }
      try {
        const allowance = await client.readContract({
          address: tok.contractAddress as Address,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [wallet as Address, chain.merchantManagerAddress as Address],
        });
        allowanceRaw = allowance.toString();
      } catch (err) {
        logger.warn('token allowance read failed', { token: tok.tokenKey, error: String(err) });
      }
      tokens.push({
        tokenId: tok.id,
        tokenKey: tok.tokenKey,
        symbol: tok.symbol,
        contractAddress: tok.contractAddress,
        decimals: tok.decimals,
        balanceRaw,
        balanceFormatted,
        allowanceRaw,
      });
    }
  }

  return {
    chainId,
    family,
    wallet,
    merchantManagerAddress: chain.merchantManagerAddress,
    walletNative,
    merchantManagerEth,
    tokens,
  };
}
