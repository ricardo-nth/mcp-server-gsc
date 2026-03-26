import { z } from 'zod';

export const HealthSnapshotSchema = z.object({
  includeToolMetrics: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include per-tool success/failure and latency counters.'),
});

export type HealthSnapshotInput = z.infer<typeof HealthSnapshotSchema>;
