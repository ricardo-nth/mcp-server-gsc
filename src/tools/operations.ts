import { HealthSnapshotSchema } from '../schemas/operations.js';
import { type SeoProviderRegistry } from '../providers/registry.js';
import { type RuntimeCoordinator } from '../utils/runtime.js';
import { jsonResult, type ToolResult } from '../utils/types.js';

export async function handleHealthSnapshot(
  runtime: RuntimeCoordinator,
  providerRegistry: SeoProviderRegistry,
  raw: unknown,
  options: {
    debugMode: boolean;
    telemetryEnabled: boolean;
  },
): Promise<ToolResult> {
  const args = HealthSnapshotSchema.parse(raw ?? {});
  const snapshot = runtime.getHealthSnapshot();
  const toolMetrics = snapshot.toolMetrics;

  return jsonResult({
    ...snapshot,
    ...(args.includeToolMetrics ? {} : { toolMetrics: undefined }),
    observability: {
      telemetryEnabled: options.telemetryEnabled,
      debugMode: options.debugMode,
    },
    providers: providerRegistry.snapshot(),
    summary: {
      status: 'ok',
      runtimeHealthy: true,
      note:
        'Snapshot captures runtime state for cache, concurrency, quota, persistence, tool counters, and external provider registry status.',
      toolMetricsIncluded: args.includeToolMetrics,
      toolCountTracked:
        args.includeToolMetrics && toolMetrics && typeof toolMetrics === 'object'
          ? Object.keys(toolMetrics as Record<string, unknown>).length
          : 0,
    },
  });
}
