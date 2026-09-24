export type ResolveMx = (
  hostname: string,
) => Promise<Array<{ exchange: string; priority: number }>>;

const POSITIVE_TTL_MS = 10 * 60 * 1000;
const NEGATIVE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 3000;

type MxCacheEntry = { ok: boolean; expiresAt: number };

const mxCache = new Map<string, MxCacheEntry>();

export function clearMxLookupCache(): void {
  mxCache.clear();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('MX_LOOKUP_TIMEOUT'));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function domainHasMxRecords(
  domain: string,
  resolveMx: ResolveMx,
  options?: { timeoutMs?: number; now?: number },
): Promise<boolean> {
  const host = domain.trim().toLowerCase();
  if (!host) return false;

  const now = options?.now ?? Date.now();
  const cached = mxCache.get(host);
  if (cached && cached.expiresAt > now) return cached.ok;

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let ok = false;
  try {
    const records = await withTimeout(resolveMx(host), timeoutMs);
    ok = Array.isArray(records) && records.length > 0;
  } catch {
    ok = false;
  }

  mxCache.set(host, {
    ok,
    expiresAt: now + (ok ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS),
  });
  return ok;
}
