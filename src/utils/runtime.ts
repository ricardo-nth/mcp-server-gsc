import {
  readRuntimeState,
  resolveRuntimeStatePath,
  writeRuntimeState,
  type PersistedRuntimeState,
} from './runtime-state.js';
import type { ToolResult } from './types.js';

interface CacheEntry {
  storedAt: number;
  ttlMs: number;
  value: ToolResult;
}

interface IdempotencyEntry {
  storedAt: number;
  ttlMs: number;
  value: ToolResult;
}

interface QuotaState {
  day: string;
  globalUsed: number;
  perToolUsed: Map<string, number>;
}

export interface RuntimeCoordinatorOptions {
  persistencePath?: string | null;
}

export interface QuotaSnapshot {
  toolUnitsReserved: number;
  toolUsed: number;
  toolBudget: number;
  globalUsed: number;
  globalBudget: number;
}

interface ToolExecutionStats {
  success: number;
  failure: number;
  totalLatencyMs: number;
  lastLatencyMs: number | null;
}

interface SemaphoreSnapshot {
  maxConcurrency: number;
  active: number;
  queued: number;
}

export interface CacheMeta {
  cacheHit: boolean;
  cacheAgeSec: number | null;
  cacheKey: string | null;
}

export interface IdempotencyMeta {
  idempotencyKey: string | null;
  idempotencyReplay: boolean;
}

interface PersistenceStatus {
  enabled: boolean;
  path: string | null;
  lastLoadedAt: string | null;
  lastSavedAt: string | null;
  lastLoadError: string | null;
}

function getEnvNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function getUtcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function stableStringify(value: unknown): string {
  const stringifyInternal = (item: unknown): string => {
    if (item === null) return 'null';
    if (item === undefined) return '"__undefined__"';
    if (typeof item === 'string') return JSON.stringify(item);
    if (typeof item === 'number' || typeof item === 'boolean') return String(item);
    if (Array.isArray(item)) {
      return `[${item.map((nested) => stringifyInternal(nested)).join(',')}]`;
    }
    const objectItem = item as Record<string, unknown>;
    const keys = Object.keys(objectItem).sort();
    const entries = keys
      .map((key) => `${JSON.stringify(key)}:${stringifyInternal(objectItem[key])}`)
      .join(',');
    return `{${entries}}`;
  };

  return stringifyInternal(value);
}

class Semaphore {
  private active = 0;

  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrency: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  snapshot(): SemaphoreSnapshot {
    return {
      maxConcurrency: this.maxConcurrency,
      active: this.active,
      queued: this.queue.length,
    };
  }
}

export class RuntimeCoordinator {
  private readonly startedAt = Date.now();

  private readonly cache = new Map<string, CacheEntry>();

  private readonly idempotency = new Map<string, IdempotencyEntry>();

  private readonly globalSemaphore = new Semaphore(
    Math.max(1, getEnvNumber('GSC_GLOBAL_CONCURRENCY', 8)),
  );

  private readonly toolSemaphores = new Map<string, Semaphore>();

  private readonly cacheTtlSec = Math.max(1, getEnvNumber('GSC_CACHE_TTL_SEC', 120));

  private readonly idempotencyTtlSec = Math.max(
    60,
    getEnvNumber('GSC_IDEMPOTENCY_TTL_SEC', 60 * 60 * 24),
  );

  private readonly globalQuotaBudget = Math.max(
    1,
    getEnvNumber('GSC_QUOTA_BUDGET_GLOBAL_DAILY', 5000),
  );

  private readonly perToolQuotaBudget = new Map<string, number>([
    ['index_inspect', Math.max(1, getEnvNumber('GSC_QUOTA_BUDGET_INDEX_INSPECT_DAILY', 1200))],
    ['batch_inspect', Math.max(1, getEnvNumber('GSC_QUOTA_BUDGET_BATCH_INSPECT_DAILY', 1200))],
    [
      'indexing_health_report',
      Math.max(1, getEnvNumber('GSC_QUOTA_BUDGET_INDEXING_HEALTH_REPORT_DAILY', 1200)),
    ],
    ['indexing_publish', Math.max(1, getEnvNumber('GSC_QUOTA_BUDGET_INDEXING_PUBLISH_DAILY', 180))],
  ]);

  private quotaState: QuotaState = {
    day: getUtcDay(),
    globalUsed: 0,
    perToolUsed: new Map<string, number>(),
  };

  private readonly toolExecutionStats = new Map<string, ToolExecutionStats>();

  private readonly persistence: PersistenceStatus;

  constructor(options: RuntimeCoordinatorOptions = {}) {
    const persistenceOverride =
      'persistencePath' in options ? options.persistencePath : process.env.GSC_RUNTIME_STATE_PATH;
    const persistencePath = resolveRuntimeStatePath(persistenceOverride);
    this.persistence = {
      enabled: persistencePath !== null,
      path: persistencePath,
      lastLoadedAt: null,
      lastSavedAt: null,
      lastLoadError: null,
    };

    this.loadPersistedState();
  }

  private warnPersistence(message: string): void {
    console.warn(`[runtime] ${message}`);
  }

  private persistState(): void {
    if (!this.persistence.enabled || !this.persistence.path) {
      return;
    }

    const now = Date.now();
    for (const [key, entry] of this.idempotency.entries()) {
      if (now - entry.storedAt > entry.ttlMs) {
        this.idempotency.delete(key);
      }
    }

    const state: PersistedRuntimeState = {
      schemaVersion: '1',
      savedAt: new Date().toISOString(),
      quotaState: {
        day: this.quotaState.day,
        globalUsed: this.quotaState.globalUsed,
        perToolUsed: Array.from(this.quotaState.perToolUsed.entries()).reduce<Record<string, number>>(
          (acc, [toolName, units]) => {
            acc[toolName] = units;
            return acc;
          },
          {},
        ),
      },
      idempotency: Array.from(this.idempotency.entries()).map(([key, entry]) => ({
        key,
        storedAt: entry.storedAt,
        ttlMs: entry.ttlMs,
        value: this.cloneResult(entry.value),
      })),
    };

    const saved = writeRuntimeState(this.persistence.path, state);
    if (saved.error) {
      this.warnPersistence(`Failed to persist runtime state: ${saved.error}`);
      return;
    }
    this.persistence.lastSavedAt = saved.savedAt;
  }

  private loadPersistedState(): void {
    if (!this.persistence.enabled || !this.persistence.path) {
      return;
    }

    const loaded = readRuntimeState(this.persistence.path);
    if (loaded.error) {
      this.persistence.lastLoadError = loaded.error;
      this.warnPersistence(`Ignoring persisted runtime state at ${this.persistence.path}: ${loaded.error}`);
      return;
    }

    if (!loaded.state) {
      return;
    }

    this.quotaState = {
      day: loaded.state.quotaState.day,
      globalUsed: loaded.state.quotaState.globalUsed,
      perToolUsed: new Map(Object.entries(loaded.state.quotaState.perToolUsed)),
    };

    const now = Date.now();
    for (const entry of loaded.state.idempotency) {
      if (now - entry.storedAt > entry.ttlMs) {
        continue;
      }
      this.idempotency.set(entry.key, {
        storedAt: entry.storedAt,
        ttlMs: entry.ttlMs,
        value: this.cloneResult(entry.value),
      });
    }

    this.persistence.lastLoadedAt = loaded.state.savedAt;
    this.persistence.lastSavedAt = loaded.state.savedAt;
    this.persistence.lastLoadError = null;

    if (this.ensureFreshDay() || loaded.state.idempotency.length !== this.idempotency.size) {
      this.persistState();
    }
  }

  private ensureFreshDay(): boolean {
    const today = getUtcDay();
    if (this.quotaState.day !== today) {
      this.quotaState = {
        day: today,
        globalUsed: 0,
        perToolUsed: new Map<string, number>(),
      };
      return true;
    }
    return false;
  }

  private cloneResult(result: ToolResult): ToolResult {
    try {
      return structuredClone(result);
    } catch {
      return JSON.parse(JSON.stringify(result)) as ToolResult;
    }
  }

  private getToolSemaphore(toolName: string): Semaphore {
    if (this.toolSemaphores.has(toolName)) {
      return this.toolSemaphores.get(toolName)!;
    }

    const normalizedToolName = toolName.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    const configuredLimit = getEnvNumber(`GSC_TOOL_CONCURRENCY_${normalizedToolName}`, 3);
    const semaphore = new Semaphore(Math.max(1, configuredLimit));
    this.toolSemaphores.set(toolName, semaphore);
    return semaphore;
  }

  private getCacheTtlSec(toolName: string): number {
    const normalizedToolName = toolName.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    return Math.max(
      1,
      getEnvNumber(`GSC_CACHE_TTL_${normalizedToolName}_SEC`, this.cacheTtlSec),
    );
  }

  private purgeExpiredEntries(): { cachePurged: boolean; idempotencyPurged: boolean } {
    const now = Date.now();
    let cachePurged = false;
    let idempotencyPurged = false;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.storedAt > entry.ttlMs) {
        this.cache.delete(key);
        cachePurged = true;
      }
    }
    for (const [key, entry] of this.idempotency.entries()) {
      if (now - entry.storedAt > entry.ttlMs) {
        this.idempotency.delete(key);
        idempotencyPurged = true;
      }
    }
    return { cachePurged, idempotencyPurged };
  }

  buildCacheKey(toolName: string, args: unknown): string {
    const normalizedArgs =
      args && typeof args === 'object'
        ? Object.fromEntries(
            Object.entries(args as Record<string, unknown>).filter(([key]) => key !== 'mode'),
          )
        : args;
    return `${toolName}:${stableStringify(normalizedArgs)}`;
  }

  getCached(cacheKey: string): { result: ToolResult; ageSec: number } | null {
    const purged = this.purgeExpiredEntries();
    if (purged.idempotencyPurged) {
      this.persistState();
    }
    const entry = this.cache.get(cacheKey);
    if (!entry) {
      return null;
    }

    const ageSec = Math.floor((Date.now() - entry.storedAt) / 1000);
    return {
      result: this.cloneResult(entry.value),
      ageSec,
    };
  }

  setCached(cacheKey: string, toolName: string, result: ToolResult): void {
    this.cache.set(cacheKey, {
      storedAt: Date.now(),
      ttlMs: this.getCacheTtlSec(toolName) * 1000,
      value: this.cloneResult(result),
    });
  }

  async withConcurrencyLimit<T>(toolName: string, operation: () => Promise<T>): Promise<T> {
    const toolSemaphore = this.getToolSemaphore(toolName);

    await this.globalSemaphore.acquire();
    await toolSemaphore.acquire();

    try {
      return await operation();
    } finally {
      toolSemaphore.release();
      this.globalSemaphore.release();
    }
  }

  estimateQuotaUnits(toolName: string, args: unknown): number {
    const objectArgs = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;

    if (toolName === 'index_inspect') {
      return 1;
    }
    if (toolName === 'batch_inspect') {
      const urls = Array.isArray(objectArgs.urls) ? objectArgs.urls.length : 1;
      return Math.max(1, Math.min(100, urls));
    }
    if (toolName === 'indexing_health_report') {
      const topN = typeof objectArgs.topN === 'number' ? objectArgs.topN : 50;
      return Math.max(1, Math.min(100, Math.floor(topN)));
    }
    if (toolName === 'indexing_publish') {
      return 1;
    }
    return 0;
  }

  reserveQuota(toolName: string, units: number): QuotaSnapshot {
    const reset = this.ensureFreshDay();

    const safeUnits = Math.max(0, units);
    const toolBudget = this.perToolQuotaBudget.get(toolName) ?? Number.POSITIVE_INFINITY;
    const toolUsed = this.quotaState.perToolUsed.get(toolName) ?? 0;

    if (safeUnits > 0 && toolUsed + safeUnits > toolBudget) {
      throw new Error(
        `Quota budget guardrail hit for ${toolName}: requested ${safeUnits} unit(s), ${Math.max(0, toolBudget - toolUsed)} remaining today.`,
      );
    }

    if (safeUnits > 0 && this.quotaState.globalUsed + safeUnits > this.globalQuotaBudget) {
      throw new Error(
        `Global quota budget guardrail hit: requested ${safeUnits} unit(s), ${Math.max(0, this.globalQuotaBudget - this.quotaState.globalUsed)} remaining today.`,
      );
    }

    if (safeUnits > 0) {
      this.quotaState.globalUsed += safeUnits;
      this.quotaState.perToolUsed.set(toolName, toolUsed + safeUnits);
    }

    if (reset || safeUnits > 0) {
      this.persistState();
    }

    return {
      toolUnitsReserved: safeUnits,
      toolUsed: this.quotaState.perToolUsed.get(toolName) ?? toolUsed,
      toolBudget,
      globalUsed: this.quotaState.globalUsed,
      globalBudget: this.globalQuotaBudget,
    };
  }

  getIdempotentResult(toolName: string, idempotencyKey: string): ToolResult | null {
    const purged = this.purgeExpiredEntries();
    if (purged.idempotencyPurged) {
      this.persistState();
    }
    const key = `${toolName}:${idempotencyKey}`;
    const entry = this.idempotency.get(key);
    if (!entry) {
      return null;
    }
    return this.cloneResult(entry.value);
  }

  saveIdempotentResult(toolName: string, idempotencyKey: string, result: ToolResult): void {
    const key = `${toolName}:${idempotencyKey}`;
    this.idempotency.set(key, {
      storedAt: Date.now(),
      ttlMs: this.idempotencyTtlSec * 1000,
      value: this.cloneResult(result),
    });
    this.persistState();
  }

  recordToolExecution(toolName: string, status: 'success' | 'failure', latencyMs: number): void {
    const existing =
      this.toolExecutionStats.get(toolName) ?? {
        success: 0,
        failure: 0,
        totalLatencyMs: 0,
        lastLatencyMs: null,
      };

    if (status === 'success') {
      existing.success += 1;
    } else {
      existing.failure += 1;
    }
    existing.totalLatencyMs += Math.max(0, latencyMs);
    existing.lastLatencyMs = Math.max(0, latencyMs);

    this.toolExecutionStats.set(toolName, existing);
  }

  getHealthSnapshot(): Record<string, unknown> {
    const purged = this.purgeExpiredEntries();
    const reset = this.ensureFreshDay();
    if (purged.idempotencyPurged || reset) {
      this.persistState();
    }

    const perToolQuotaUsed = Array.from(this.quotaState.perToolUsed.entries())
      .sort(([toolA], [toolB]) => toolA.localeCompare(toolB))
      .reduce<Record<string, number>>((acc, [toolName, units]) => {
        acc[toolName] = units;
        return acc;
      }, {});

    const perToolQuotaBudget = Array.from(this.perToolQuotaBudget.entries())
      .sort(([toolA], [toolB]) => toolA.localeCompare(toolB))
      .reduce<Record<string, number>>((acc, [toolName, units]) => {
        acc[toolName] = units;
        return acc;
      }, {});

    const toolMetrics = Array.from(this.toolExecutionStats.entries())
      .sort(([toolA], [toolB]) => toolA.localeCompare(toolB))
      .reduce<Record<string, Record<string, number | null>>>((acc, [toolName, stats]) => {
        const totalCalls = stats.success + stats.failure;
        acc[toolName] = {
          success: stats.success,
          failure: stats.failure,
          totalCalls,
          lastLatencyMs: stats.lastLatencyMs,
          avgLatencyMs:
            totalCalls > 0 ? Number((stats.totalLatencyMs / totalCalls).toFixed(2)) : null,
        };
        return acc;
      }, {});

    const toolConcurrency = Array.from(this.toolSemaphores.entries())
      .sort(([toolA], [toolB]) => toolA.localeCompare(toolB))
      .reduce<Record<string, SemaphoreSnapshot>>((acc, [toolName, semaphore]) => {
        acc[toolName] = semaphore.snapshot();
        return acc;
      }, {});

    return {
      timestamp: new Date().toISOString(),
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      cache: {
        ttlSecDefault: this.cacheTtlSec,
        entries: this.cache.size,
      },
      idempotency: {
        ttlSec: this.idempotencyTtlSec,
        entries: this.idempotency.size,
      },
      persistence: {
        enabled: this.persistence.enabled,
        path: this.persistence.path,
        lastLoadedAt: this.persistence.lastLoadedAt,
        lastSavedAt: this.persistence.lastSavedAt,
        lastLoadError: this.persistence.lastLoadError,
        quotaEntriesPersisted: this.quotaState.perToolUsed.size,
        idempotencyEntriesPersisted: this.idempotency.size,
      },
      concurrency: {
        global: this.globalSemaphore.snapshot(),
        perTool: toolConcurrency,
      },
      quota: {
        day: this.quotaState.day,
        global: {
          used: this.quotaState.globalUsed,
          budget: this.globalQuotaBudget,
          remaining: Math.max(0, this.globalQuotaBudget - this.quotaState.globalUsed),
        },
        perToolUsed: perToolQuotaUsed,
        perToolBudget: perToolQuotaBudget,
      },
      toolMetrics,
    };
  }
}
