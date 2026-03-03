/**
 * Retry a function with exponential backoff and jitter.
 * Retries on 429 (quota) and 5xx errors. Throws immediately on 4xx.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = getStatusCode(err);
      const isRetryable =
        status === 429 ||
        (status !== undefined && status >= 500) ||
        isRetryableNetworkError(err);

      if (!isRetryable || attempt === maxRetries) throw err;

      const delay = baseDelay * Math.pow(2, attempt) * (0.5 + Math.random());
      await sleep(delay);
    }
  }

  // Unreachable, but satisfies TS
  throw new Error('Retry exhausted');
}

/** Rate-limited sequential execution with delay between calls */
export async function rateLimited<T>(
  fns: Array<() => Promise<T>>,
  delayMs: number,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < fns.length; i++) {
    if (i > 0) await sleep(delayMs);
    results.push(await fns[i]());
  }
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatusCode(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.code === 'number') return e.code;
    if (typeof e.status === 'number') return e.status;
    if (
      typeof e.response === 'object' &&
      e.response !== null &&
      typeof (e.response as Record<string, unknown>).status === 'number'
    ) {
      return (e.response as Record<string, unknown>).status as number;
    }
  }
  return undefined;
}

function isRetryableNetworkError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;

  const e = err as Record<string, unknown>;
  const code = typeof e.code === 'string' ? e.code.toUpperCase() : '';
  const message =
    err instanceof Error ? err.message.toLowerCase() : '';

  const transientCodes = new Set([
    'ECONNRESET',
    'ECONNABORTED',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ENOTFOUND',
    'EPIPE',
  ]);

  if (transientCodes.has(code)) return true;

  return (
    message.includes('network') ||
    message.includes('socket hang up') ||
    message.includes('timed out') ||
    message.includes('connection reset')
  );
}
