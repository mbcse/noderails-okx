import { env } from '../config.js';

const ONEINCH_NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

export interface OneInchQuote {
  dstAmount: string;
  srcToken: { address: string; symbol?: string; decimals?: number };
  dstToken: { address: string; symbol?: string; decimals?: number };
}

export interface OneInchSwap {
  dstAmount: string;
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gas?: number;
    gasPrice?: string;
  };
}

export class OneInchClient {
  constructor(
    private readonly apiKey = env.ONEINCH_API_KEY,
    private readonly baseUrl = env.ONEINCH_BASE_URL.replace(/\/$/, ''),
    private readonly timeoutMs = env.ONEINCH_TIMEOUT_MS,
  ) {}

  nativeTokenAddress(): string {
    return ONEINCH_NATIVE;
  }

  async getSpender(chainId: number): Promise<string> {
    const json = await this.getJson<{ address: string }>(
      `/swap/v6.1/${chainId}/approve/spender`,
    );
    if (!json.address) {
      throw new Error('1inch spender address missing');
    }
    return json.address;
  }

  async getQuote(input: {
    chainId: number;
    src: string;
    dst: string;
    amount: string;
  }): Promise<OneInchQuote> {
    const search = new URLSearchParams({
      src: input.src,
      dst: input.dst,
      amount: input.amount,
    });
    return this.getJson<OneInchQuote>(`/swap/v6.1/${input.chainId}/quote?${search.toString()}`);
  }

  async getSwap(input: {
    chainId: number;
    src: string;
    dst: string;
    amount: string;
    from: string;
    origin: string;
    receiver: string;
    slippagePercent?: number;
    minReturn?: string;
  }): Promise<OneInchSwap> {
    const hasMinReturn = input.minReturn !== undefined && input.minReturn !== '';
    const hasSlippage = input.slippagePercent !== undefined;
    if (hasMinReturn === hasSlippage) {
      throw new Error('1inch swap requires exactly one of minReturn or slippagePercent');
    }
    const search = new URLSearchParams({
      src: input.src,
      dst: input.dst,
      amount: input.amount,
      from: input.from,
      origin: input.origin,
      receiver: input.receiver,
      disableEstimate: 'true',
      allowPartialFill: 'false',
    });
    if (hasMinReturn) {
      search.set('minReturn', input.minReturn!);
    } else {
      search.set('slippage', String(input.slippagePercent));
    }
    return this.getJson<OneInchSwap>(`/swap/v6.1/${input.chainId}/swap?${search.toString()}`);
  }

  private async getJson<T>(path: string): Promise<T> {
    if (!this.apiKey) {
      throw new Error('ONEINCH_API_KEY is not configured');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      const json = (await res.json()) as T & { description?: string; error?: string };
      if (!res.ok) {
        throw new Error(json.description ?? json.error ?? `1inch error ${res.status}`);
      }
      return json;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const oneInchClient = new OneInchClient();
