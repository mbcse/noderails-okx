import { env } from '../config.js';

const ONEINCH_NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

export interface OneInchQuote {
  dstAmount: string;
  srcToken?: { address: string; symbol?: string; decimals?: number };
  dstToken?: { address: string; symbol?: string; decimals?: number };
}

export class OneInchClient {
  constructor(
    private readonly apiKey = env.ONEINCH_API_KEY,
    private readonly baseUrl = env.ONEINCH_BASE_URL,
    private readonly timeoutMs = env.ONEINCH_TIMEOUT_MS,
  ) {}

  nativeTokenAddress(): string {
    return ONEINCH_NATIVE;
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
    if (!this.apiKey) {
      throw new Error('ONEINCH_API_KEY is not configured');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/swap/v6.1/${input.chainId}/quote?${search.toString()}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      const json = (await res.json()) as OneInchQuote & { description?: string; error?: string };
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
