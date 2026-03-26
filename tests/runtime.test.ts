import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';
import { RuntimeCoordinator } from '../src/utils/runtime.js';
import { jsonResult } from '../src/utils/types.js';
import { normalizeQuotaTrackedArgs } from '../src/utils/quota.js';

describe('RuntimeCoordinator', () => {
  it('returns cached responses with cache age metadata', () => {
    const runtime = new RuntimeCoordinator({ persistencePath: null });
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
    const runtime = new RuntimeCoordinator({ persistencePath: null });
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
    const runtime = new RuntimeCoordinator({ persistencePath: null });
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

  it('reports health snapshot counters for cache, quota, and tool execution', () => {
    const runtime = new RuntimeCoordinator({ persistencePath: null });
    const cacheKey = runtime.buildCacheKey('search_analytics', {
      siteUrl: 'sc-domain:example.com',
      days: 7,
    });

    runtime.setCached(cacheKey, 'search_analytics', jsonResult({ rows: [] }));
    runtime.reserveQuota('index_inspect', 1);
    runtime.recordToolExecution('search_analytics', 'success', 42);
    runtime.recordToolExecution('search_analytics', 'failure', 21);

    const snapshot = runtime.getHealthSnapshot();
    const cache = snapshot.cache as Record<string, unknown>;
    const quota = snapshot.quota as Record<string, unknown>;
    const globalQuota = quota.global as Record<string, unknown>;
    const toolMetrics = snapshot.toolMetrics as Record<string, Record<string, unknown>>;

    expect(cache.entries).toBe(1);
    expect(globalQuota.used).toBe(1);
    expect(toolMetrics.search_analytics.totalCalls).toBe(2);
    expect(toolMetrics.search_analytics.avgLatencyMs).toBe(31.5);
    expect(snapshot.persistence).toEqual({
      enabled: false,
      path: null,
      lastLoadedAt: null,
      lastSavedAt: null,
      lastLoadError: null,
      quotaEntriesPersisted: 1,
      idempotencyEntriesPersisted: 0,
    });
  });

  it('does not consume quota guardrails when quota-tracked args fail validation', () => {
    const runtime = new RuntimeCoordinator({ persistencePath: null });

    expect(() =>
      normalizeQuotaTrackedArgs('batch_inspect', {
        siteUrl: 'sc-domain:example.com',
        urls: ['not-a-url'],
      }),
    ).toThrow();

    const snapshot = runtime.getHealthSnapshot();
    const quota = snapshot.quota as Record<string, unknown>;
    const globalQuota = quota.global as Record<string, unknown>;

    expect(globalQuota.used).toBe(0);
  });

  it('persists quota usage and idempotency records across restarts', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'gsc-runtime-'));
    const statePath = join(stateDir, 'runtime-state.json');

    const firstRuntime = new RuntimeCoordinator({ persistencePath: statePath });
    firstRuntime.reserveQuota('indexing_publish', 1);
    firstRuntime.saveIdempotentResult(
      'indexing_publish',
      'publish-key-001',
      jsonResult({ url: 'https://example.com/a', status: 'ok' }),
    );

    const secondRuntime = new RuntimeCoordinator({ persistencePath: statePath });
    const snapshot = secondRuntime.getHealthSnapshot();
    const quota = snapshot.quota as Record<string, unknown>;
    const globalQuota = quota.global as Record<string, unknown>;
    const persistence = snapshot.persistence as Record<string, unknown>;
    const replay = secondRuntime.getIdempotentResult('indexing_publish', 'publish-key-001');

    expect(globalQuota.used).toBe(1);
    expect(replay?.structuredContent).toEqual({ url: 'https://example.com/a', status: 'ok' });
    expect(persistence.enabled).toBe(true);
    expect(persistence.path).toBe(statePath);
    expect(typeof persistence.lastLoadedAt).toBe('string');
    expect(typeof persistence.lastSavedAt).toBe('string');
    expect(persistence.idempotencyEntriesPersisted).toBe(1);
  });

  it('ignores malformed persisted state files and starts clean', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'gsc-runtime-'));
    const statePath = join(stateDir, 'runtime-state.json');
    writeFileSync(statePath, '{"schemaVersion":"1","savedAt":true}', 'utf8');

    const runtime = new RuntimeCoordinator({ persistencePath: statePath });
    const snapshot = runtime.getHealthSnapshot();
    const quota = snapshot.quota as Record<string, unknown>;
    const globalQuota = quota.global as Record<string, unknown>;
    const persistence = snapshot.persistence as Record<string, unknown>;

    expect(globalQuota.used).toBe(0);
    expect(persistence.lastLoadedAt).toBeNull();
    expect(typeof persistence.lastLoadError).toBe('string');
  });

  it('purges expired idempotency entries before persisting state', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'gsc-runtime-'));
    const statePath = join(stateDir, 'runtime-state.json');

    const runtime = new RuntimeCoordinator({ persistencePath: statePath });
    runtime.saveIdempotentResult(
      'indexing_publish',
      'publish-key-001',
      jsonResult({ url: 'https://example.com/a', status: 'ok' }),
    );

    const persisted = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>;
    const idempotency = persisted.idempotency as Array<Record<string, unknown>>;
    idempotency[0]!.storedAt = 0;
    idempotency[0]!.ttlMs = 1;
    writeFileSync(statePath, JSON.stringify(persisted, null, 2), 'utf8');

    const reloaded = new RuntimeCoordinator({ persistencePath: statePath });
    expect(reloaded.getIdempotentResult('indexing_publish', 'publish-key-001')).toBeNull();

    const compacted = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>;
    expect(compacted.idempotency).toEqual([]);
  });
});
