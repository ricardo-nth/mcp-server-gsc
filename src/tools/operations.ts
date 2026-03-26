import { HealthSnapshotSchema } from '../schemas/operations.js';
import { type RuntimeCoordinator } from '../utils/runtime.js';
import { jsonResult, type ToolResult } from '../utils/types.js';

export async function handleHealthSnapshot(
  runtime: RuntimeCoordinator,
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
    summary: {
      status: 'ok',
      runtimeHealthy: true,
      note: 'Snapshot captures in-memory runtime state for cache, concurrency, quota, and tool counters.',
      toolMetricsIncluded: args.includeToolMetrics,
      toolCountTracked:
        args.includeToolMetrics && toolMetrics && typeof toolMetrics === 'object'
          ? Object.keys(toolMetrics as Record<string, unknown>).length
          : 0,
    },
  });
}
