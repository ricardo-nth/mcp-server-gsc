import { z } from 'zod';
import { IndexInspectSchema } from '../schemas/inspection.js';
import { BatchInspectSchema } from '../schemas/computed.js';
import { IndexingHealthReportSchema } from '../schemas/computed2.js';
import { IndexingPublishSchema } from '../schemas/indexing.js';

const QUOTA_INPUT_VALIDATORS: Partial<Record<string, (args: unknown) => unknown>> = {
  index_inspect: (args) => IndexInspectSchema.parse(args),
  batch_inspect: (args) => BatchInspectSchema.parse(args),
  indexing_health_report: (args) => IndexingHealthReportSchema.parse(args),
  indexing_publish: (args) => IndexingPublishSchema.parse(args),
};

export function normalizeQuotaTrackedArgs(toolName: string, args: unknown): unknown {
  const validator = QUOTA_INPUT_VALIDATORS[toolName];
  return validator ? validator(args) : args;
}

export function isQuotaValidationError(error: unknown): error is z.ZodError {
  return error instanceof z.ZodError;
}
