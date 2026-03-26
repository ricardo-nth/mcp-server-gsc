import { describe, it, expect, vi } from 'vitest';
import { RuntimeCoordinator } from '../src/utils/runtime.js';
import { handleHealthSnapshot } from '../src/tools/operations.js';
import { redactSensitiveData } from '../src/utils/redaction.js';
import { withRetry, withRetryTraceContext } from '../src/utils/retry.js';
import { TelemetryRecorder, type TelemetrySink } from '../src/utils/telemetry.js';

describe('Phase 6 observability utilities', () => {
  it('health_snapshot handler can omit tool metrics', async () => {
    const runtime = new RuntimeCoordinator();
    runtime.recordToolExecution('search_analytics', 'success', 10);

    const result = await handleHealthSnapshot(
      runtime,
      { includeToolMetrics: false },
      { debugMode: true, telemetryEnabled: true },
    );
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;

    expect(payload.toolMetrics).toBeUndefined();
    expect((payload.summary as Record<string, unknown>).toolMetricsIncluded).toBe(false);
    expect((payload.observability as Record<string, unknown>).debugMode).toBe(true);
  });

  it('redacts secret-like keys and bearer tokens', () => {
    const payload = redactSensitiveData({
      apiKey: 'AIza1234567890abcdefghij1234567890',
      authHeader: 'Bearer abcdefghijklmnopqrstuvwxyz0123456789',
      contact: 'owner@example.com',
    }) as Record<string, unknown>;

    expect(payload.apiKey).toBe('[REDACTED]');
    expect(payload.authHeader).toBe('Bearer [REDACTED_TOKEN]');
    expect(payload.contact).toBe('[REDACTED_EMAIL]');
  });

  it('captures retry attempts within trace context', async () => {
    let attempt = 0;
    const traced = await withRetryTraceContext(async () =>
      withRetry(async () => {
        if (attempt < 1) {
          attempt += 1;
          throw { status: 429 };
        }
        return 'ok';
      }, { baseDelayMs: 0, maxRetries: 1 }),
    );

    expect(traced.result).toBe('ok');
    expect(traced.retries).toBe(1);
  });

  it('emits structured events when telemetry is enabled', () => {
    const spy = vi.fn();
    const sink: TelemetrySink = {
      emit: spy,
    };
    const recorder = new TelemetryRecorder(sink, true);

    recorder.track({
      timestamp: new Date().toISOString(),
      requestId: 'req-123',
      toolName: 'search_analytics',
      mode: 'full',
      status: 'success',
      latencyMs: 50,
      retries: 0,
      quotaUnitsEstimated: 0,
      quotaUnitsReserved: 0,
      cacheHit: false,
      idempotencyReplay: false,
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
