import type { PriceRequest, PriceSourceAdapter, PriceSourceType, SourceQuote } from './types.js';

export abstract class BasePriceAdapter implements PriceSourceAdapter {
  abstract readonly slug: string;
  abstract readonly type: PriceSourceType;

  abstract supports(request: PriceRequest): boolean;
  abstract fetchQuote(request: PriceRequest): Promise<SourceQuote>;

  protected async fetchWithTimeout<T>(
    url: string,
    timeoutMs: number,
    init?: RequestInit,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!res.ok) throw new Error(`${this.slug} responded with ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export type { PriceSourceAdapter, PriceRequest, SourceQuote };
