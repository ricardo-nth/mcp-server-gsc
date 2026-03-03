import { describe, it, expect } from 'vitest';
import { RuntimeCoordinator } from '../src/utils/runtime.js';
import { jsonResult } from '../src/utils/types.js';

describe('RuntimeCoordinator', () => {
  it('returns cached responses with cache age metadata', () => {
    const runtime = new RuntimeCoordinator();
    const cacheKey = runtime.buildCacheKey('search_analytics', {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      mode: 'compact',
    });

    runtime.setCached(cacheKey, 'search_analytics', jsonResult({ rows: [{ clicks: 10 }] }));
    const cached = runtime.getCached(cacheKey);

    expect(cached).not.toBeNull();
    expect(cached?.ageSec).toBeGreaterThanOrEqual(0);
    expect(cached?.result.structuredContent).toEqual({ rows: [{ clicks: 10 }] });
  });

  it('stores and replays idempotent results', () => {
    const runtime = new RuntimeCoordinator();
    runtime.saveIdempotentResult(
      'indexing_publish',
      'publish-key-001',
      jsonResult({ url: 'https://example.com/a', status: 'ok' }),
    );

    const replay = runtime.getIdempotentResult('indexing_publish', 'publish-key-001');
    expect(replay).not.toBeNull();
    expect(replay?.structuredContent).toEqual({ url: 'https://example.com/a', status: 'ok' });
  });

  it('normalizes mode out of cache keys', () => {
    const runtime = new RuntimeCoordinator();
    const a = runtime.buildCacheKey('search_analytics', {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      mode: 'full',
    });
    const b = runtime.buildCacheKey('search_analytics', {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      mode: 'compact',
    });

    expect(a).toBe(b);
  });
});
