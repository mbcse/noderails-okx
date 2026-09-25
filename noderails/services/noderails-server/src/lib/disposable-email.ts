import {
  parseDisposableBlocklist,
  replaceDisposableEmailDomains,
} from '@noderails/common';
import type { Logger } from '@noderails/service-base';

export const DEFAULT_DISPOSABLE_EMAIL_BLOCKLIST_URL =
  'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf';

const FETCH_TIMEOUT_MS = 5_000;
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'NodeRails';

function blocklistUrl(): string {
  const override = process.env.DISPOSABLE_EMAIL_BLOCKLIST_URL?.trim();
  return override || DEFAULT_DISPOSABLE_EMAIL_BLOCKLIST_URL;
}

export async function refreshDisposableEmailBlocklist(logger: Logger): Promise<void> {
  const url = blocklistUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!response.ok) {
      logger.warn('Disposable email blocklist fetch failed', {
        url,
        status: response.status,
      });
      return;
    }

    const text = await response.text();
    const domains = parseDisposableBlocklist(text);
    if (domains.length === 0) {
      logger.warn('Disposable email blocklist fetch returned no domains; keeping last list', { url });
      return;
    }

    replaceDisposableEmailDomains(domains);
    logger.info('Disposable email blocklist refreshed', { url, domains: domains.length });
  } catch (error) {
    logger.warn('Disposable email blocklist fetch failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timer);
  }
}

export function startDisposableEmailBlocklistRefresh(logger: Logger): { stop: () => void } {
  void refreshDisposableEmailBlocklist(logger);
  const timer = setInterval(() => {
    void refreshDisposableEmailBlocklist(logger);
  }, REFRESH_INTERVAL_MS);
  timer.unref();
  return {
    stop: () => clearInterval(timer),
  };
}
