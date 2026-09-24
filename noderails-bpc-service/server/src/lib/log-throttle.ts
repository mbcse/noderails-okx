/** Rate-limit repeated log lines — returns whether to emit and how many were suppressed. */
const buckets = new Map<string, { lastLogAt: number; suppressed: number }>();

export function logThrottle(
  key: string,
  intervalMs: number,
): { shouldLog: boolean; suppressed: number } {
  const now = Date.now();
  const entry = buckets.get(key) ?? { lastLogAt: 0, suppressed: 0 };

  if (now - entry.lastLogAt >= intervalMs) {
    const suppressed = entry.suppressed;
    buckets.set(key, { lastLogAt: now, suppressed: 0 });
    return { shouldLog: true, suppressed };
  }

  entry.suppressed += 1;
  buckets.set(key, entry);
  return { shouldLog: false, suppressed: entry.suppressed };
}

export function clearLogThrottle(key: string): void {
  buckets.delete(key);
}
