import {
  addressMatchesChainFamily,
  getLeanRpcUrl,
  isNativeToken,
  NotFoundError,
  ValidationError,
} from '@noderails/common';
import type { Logger } from '@noderails/service-base';
import { getDatabaseClient } from '@noderails/database';
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
  parseAbi,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import * as priceService from '../prices/price.service.js';
import * as authorizeService from '../payments/authorize.service.js';
import * as checkoutSessionService from './checkout-session.service.js';

const permitNonceAbi = parseAbi([
  'function nonces(address owner) view returns (uint256)',
  'function version() view returns (string)',
]);

const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export interface HeadlessPrepareInput {
  tokenKey: string;
  chainId: number;
  walletAddress: string;
}

export interface HeadlessConfirmInput {
  walletAddress: string;
  chainId: number;
  tokenKey: string;
  customerEmail: string;
  cryptoAmount: string;
  exchangeRate: string;
  quoteId?: string;
  permitSignature?: {
    amount: string;
    deadline: string;
    v: number;
    r: string;
    s: string;
  };
  approvalTxHash?: string;
  customerName?: string;
  billingAddress?: string;
  billingCity?: string;
  billingState?: string;
  billingCountry?: string;
  billingPostalCode?: string;
}

export interface HeadlessSubmitUserTxInput {
  intentId: string;
  txHash?: string;
  suiSponsored?: {
    userSignature?: string;
    transactionBlockBase64: string;
    sponsorSignature: string;
    mtxmChainId: string;
    packageId: string;
    dualSignRequired?: boolean;
  };
}

function ceilToSixDecimals(rawAmount: bigint, tokenDecimals: number): bigint {
  if (tokenDecimals <= 6) return rawAmount;
  const scale = 10n ** BigInt(tokenDecimals - 6);
  return ((rawAmount + scale - 1n) / scale) * scale;
}

function standingAuthCycles(interval: string | null | undefined, intervalCount: number): number {
  const count = intervalCount > 0 ? intervalCount : 1;
  switch ((interval ?? '').toUpperCase()) {
    case 'MINUTE':
      return Math.ceil(525_960 / count);
    case 'DAY':
      return Math.ceil(365 / count);
    case 'WEEK':
      return Math.ceil(52 / count);
    case 'MONTH':
      return Math.ceil(12 / count);
    case 'YEAR':
      return Math.ceil(1 / count);
    default:
      return 12;
  }
}

function rawFromPrice(price: { tokenAmount?: string; cryptoAmount?: string }, decimals: number): bigint {
  if (price.cryptoAmount) return BigInt(price.cryptoAmount);
  if (!price.tokenAmount) {
    throw new ValidationError('Price conversion returned no token amount');
  }
  return parseUnits(price.tokenAmount, decimals);
}

async function loadOwnedOpenSession(merchantId: string, sessionId: string) {
  const session = await checkoutSessionService.getCheckoutSession(merchantId, sessionId);
  if (session.status === 'OPEN' && session.expiresAt < new Date()) {
    await checkoutSessionService.expireCheckoutSession(merchantId, sessionId);
    throw new ValidationError('Checkout session has expired');
  }
  if (session.status !== 'OPEN') {
    throw new ValidationError(`Checkout session is ${session.status}, cannot continue`);
  }
  return session;
}

export async function getPaymentOptions(merchantId: string, sessionId: string, logger: Logger) {
  await loadOwnedOpenSession(merchantId, sessionId);
  const payment = await checkoutSessionService.getCheckoutSessionForPayment(sessionId);
  if (payment.status !== 'OPEN') {
    throw new ValidationError(`Checkout session is ${payment.status}, cannot list payment options`);
  }

  const fiatAmount = typeof payment.amount === 'number' ? payment.amount : Number(payment.amount);
  const currency = payment.currency || 'USD';

  const acceptedTokens = await Promise.all(
    payment.acceptedTokens.map(async (token) => {
      try {
        const price = await priceService.getPrice(
          { asset: token.tokenKey, currency, amountFiat: fiatAmount },
          logger,
        );
        const raw = rawFromPrice(price, token.decimals);
        return {
          ...token,
          quote: {
            cryptoAmount: raw.toString(),
            exchangeRate: price.tokenAmount ?? priceService.convertFiatToToken(fiatAmount, price.priceFiat),
          },
        };
      } catch (err) {
        logger.warn('Headless payment-options quote failed', {
          sessionId,
          tokenKey: token.tokenKey,
          error: String(err),
        });
        return { ...token, quote: null };
      }
    }),
  );

  return {
    id: payment.id,
    status: payment.status,
    mode: payment.mode,
    amount: fiatAmount,
    currency,
    requireBillingDetails: payment.requireBillingDetails,
    conversionEnabled: payment.conversionEnabled ?? false,
    targetTokenKey: payment.targetTokenKey ?? null,
    acceptedChains: payment.acceptedChains.map((chain) => ({
      chainId: chain.chainId,
      chainType: chain.chainType,
      name: chain.name,
      displayName: chain.displayName,
      nativeCurrencySymbol: chain.nativeCurrencySymbol,
      iconUrl: chain.iconUrl,
      isTestnet: chain.isTestnet,
      escrowAddress: chain.escrowAddress,
      settlementAddress: chain.settlementAddress ?? null,
      escrowConfigObjectId: chain.escrowConfigObjectId ?? null,
      paymentRegistryObjectId: chain.paymentRegistryObjectId ?? null,
      walletRegistryObjectId: chain.walletRegistryObjectId ?? null,
    })),
    acceptedTokens,
  };
}

async function buildPermitTypedData(input: {
  tokenAddress: string;
  tokenName: string;
  permitVersion: string | null;
  chainId: number;
  walletAddress: string;
  spender: string;
  amount: bigint;
}) {
  const client = createPublicClient({ transport: http(getLeanRpcUrl(input.chainId)) });
  const token = input.tokenAddress as Address;
  const owner = input.walletAddress as Address;

  const [onchainName, nonce] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: 'name' }),
    client.readContract({
      address: token,
      abi: permitNonceAbi,
      functionName: 'nonces',
      args: [owner],
    }),
  ]);

  let version = input.permitVersion ?? '1';
  try {
    version = await client.readContract({
      address: token,
      abi: permitNonceAbi,
      functionName: 'version',
    });
  } catch {
    /* keep catalog / default version */
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const domainName = String(onchainName || input.tokenName);

  return {
    type: 'permit' as const,
    typedData: {
      domain: {
        name: domainName,
        version,
        chainId: input.chainId,
        verifyingContract: input.tokenAddress,
      },
      types: PERMIT_TYPES,
      primaryType: 'Permit' as const,
      message: {
        owner: input.walletAddress,
        spender: input.spender,
        value: input.amount.toString(),
        nonce: nonce.toString(),
        deadline: deadline.toString(),
      },
    },
  };
}

export async function prepareHeadlessCheckout(
  merchantId: string,
  sessionId: string,
  input: HeadlessPrepareInput,
  logger: Logger,
) {
  const session = await loadOwnedOpenSession(merchantId, sessionId);
  const payment = await checkoutSessionService.getCheckoutSessionForPayment(sessionId);
  if (payment.status !== 'OPEN') {
    throw new ValidationError(`Checkout session is ${payment.status}, cannot prepare`);
  }

  const chain = payment.acceptedChains.find((c) => c.chainId === input.chainId);
  if (!chain) {
    throw new ValidationError(`Chain ${input.chainId} is not accepted for this session`);
  }
  if (!chain.escrowAddress) {
    throw new ValidationError(`No escrow contract deployed on chain ${input.chainId}`);
  }
  if (!addressMatchesChainFamily(chain.chainType, input.walletAddress)) {
    throw new ValidationError(`Wallet address does not match ${chain.chainType}`);
  }

  const token = payment.acceptedTokens.find(
    (t) => t.tokenKey === input.tokenKey && t.chainId === input.chainId,
  );
  if (!token) {
    throw new ValidationError(`Token ${input.tokenKey} is not accepted on chain ${input.chainId}`);
  }

  const fiatAmount = typeof payment.amount === 'number' ? payment.amount : Number(payment.amount);
  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
    throw new ValidationError('Checkout session must have a positive amount');
  }
  const currency = payment.currency || 'USD';

  const needsSwapQuote =
    Boolean(payment.conversionEnabled) &&
    Boolean(payment.targetTokenKey) &&
    payment.targetTokenKey !== token.tokenKey;

  const price = await priceService.getPrice(
    needsSwapQuote
      ? {
          asset: token.tokenKey,
          currency,
          amountFiat: fiatAmount,
          dstAsset: payment.targetTokenKey ?? undefined,
          quote: 'swap',
          checkoutSessionId: sessionId,
        }
      : { asset: token.tokenKey, currency, amountFiat: fiatAmount },
    logger,
  );

  const chargeRaw = rawFromPrice(price, token.decimals);
  const roundedCharge = ceilToSixDecimals(chargeRaw, token.decimals);
  const isSubscription = payment.mode === 'SUBSCRIPTION';
  const priceRow = session.items.find((item) => item.productPlanPrice?.billingInterval)?.productPlanPrice;
  const authRaw = isSubscription
    ? roundedCharge * BigInt(standingAuthCycles(priceRow?.billingInterval, priceRow?.billingIntervalCount ?? 1))
    : roundedCharge;

  const exchangeRate = price.tokenAmount ?? priceService.convertFiatToToken(fiatAmount, price.priceFiat);
  const native = isNativeToken(token.contractAddress);

  let userAction:
    | Awaited<ReturnType<typeof buildPermitTypedData>>
    | { type: 'approve'; to: string; data: Hex; spender: string; amount: string }
    | { type: 'native_capture' }
    | { type: 'solana_capture' }
    | { type: 'sui_capture' }
    | {
        type: 'sui_wallet_setup';
        walletSetup: {
          tokenContractAddress: string;
          merchantAddress: string;
          remainingBudget: string;
          maxPerCharge: string;
          expiresAtMs: string;
        };
      };

  if (chain.chainType === 'SOLANA') {
    userAction = { type: 'solana_capture' };
  } else if (chain.chainType === 'SUI') {
    if (isSubscription) {
      const merchantAddress = chain.settlementAddress?.trim();
      if (!merchantAddress) {
        throw new ValidationError('Connect a Sui receiving wallet before accepting subscription payments');
      }
      userAction = {
        type: 'sui_wallet_setup',
        walletSetup: {
          tokenContractAddress: token.contractAddress,
          merchantAddress,
          remainingBudget: authRaw.toString(),
          maxPerCharge: chargeRaw.toString(),
          expiresAtMs: String(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      };
    } else {
      userAction = { type: 'sui_capture' };
    }
  } else if (native) {
    userAction = { type: 'native_capture' };
  } else if (token.supportsPermit) {
    userAction = await buildPermitTypedData({
      tokenAddress: token.contractAddress,
      tokenName: token.name,
      permitVersion: token.permitVersion,
      chainId: input.chainId,
      walletAddress: input.walletAddress,
      spender: chain.escrowAddress,
      amount: authRaw,
    });
  } else {
    userAction = {
      type: 'approve',
      to: token.contractAddress,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [chain.escrowAddress as Address, authRaw],
      }),
      spender: chain.escrowAddress,
      amount: authRaw.toString(),
    };
  }

  return {
    sessionId,
    mode: payment.mode,
    chainId: input.chainId,
    walletAddress: input.walletAddress,
    token: {
      tokenKey: token.tokenKey,
      symbol: token.symbol,
      decimals: token.decimals,
      contractAddress: token.contractAddress,
      supportsPermit: token.supportsPermit,
    },
    cryptoAmount: chargeRaw.toString(),
    exchangeRate,
    quoteId: price.quoteId ?? null,
    escrowAddress: chain.escrowAddress,
    authAmount: authRaw.toString(),
    chargeAmount: chargeRaw.toString(),
    billingInterval: priceRow?.billingInterval ?? null,
    userAction,
  };
}

export async function confirmHeadlessCheckout(
  merchantId: string,
  sessionId: string,
  input: HeadlessConfirmInput,
  logger: Logger,
) {
  await loadOwnedOpenSession(merchantId, sessionId);

  return authorizeService.authorizeFromCheckoutSession(
    {
      checkoutSessionId: sessionId,
      walletAddress: input.walletAddress,
      chainId: input.chainId,
      tokenKey: input.tokenKey,
      authorizationMethod: input.permitSignature ? 'PERMIT' : 'NATIVE',
      permitSignature: input.permitSignature,
      approvalTxHash: input.approvalTxHash,
      cryptoAmount: input.cryptoAmount,
      exchangeRate: input.exchangeRate,
      quoteId: input.quoteId,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      billingAddress: input.billingAddress,
      billingCity: input.billingCity,
      billingState: input.billingState,
      billingCountry: input.billingCountry,
      billingPostalCode: input.billingPostalCode,
    },
    logger,
  );
}

export async function submitHeadlessUserTx(
  merchantId: string,
  sessionId: string,
  input: HeadlessSubmitUserTxInput,
  logger: Logger,
) {
  const session = await checkoutSessionService.getCheckoutSession(merchantId, sessionId);
  const db = getDatabaseClient();
  const intent = await db.paymentIntent.findUnique({ where: { id: input.intentId } });
  if (!intent) throw new NotFoundError('PaymentIntent', input.intentId);
  if (intent.sourceType !== 'CHECKOUT_SESSION' || intent.sourceId !== session.id) {
    throw new ValidationError('Payment intent does not belong to this checkout session');
  }
  if (!input.txHash && !input.suiSponsored) {
    throw new ValidationError('Either txHash or suiSponsored is required');
  }

  return authorizeService.reportNativeCapture(
    input.intentId,
    input.suiSponsored ?? input.txHash!,
    logger,
  );
}
