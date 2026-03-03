import { z } from 'zod';
import { DateRangeSchema, SiteUrlSchema } from './base.js';

export const RecommendNextActionsSchema = SiteUrlSchema.merge(DateRangeSchema).extend({
  rowLimit: z
    .number()
    .min(50)
    .max(5000)
    .optional()
    .default(1000)
    .describe('Maximum search analytics rows used for opportunity modeling (default 1000).'),
  topActions: z
    .number()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe('Number of ranked recommendations to return (default 5).'),
  minImpressions: z
    .number()
    .min(1)
    .max(100000)
    .optional()
    .default(80)
    .describe('Minimum impressions required for a query-page pair to be considered (default 80).'),
  maxDiagnosticPages: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .default(3)
    .describe('Maximum number of pages to run indexing/CWV diagnostics on (default 3).'),
  languageCode: z
    .string()
    .optional()
    .default('en-US')
    .describe('Language code used for URL Inspection checks (default en-US).'),
  includeCwv: z
    .boolean()
    .optional()
    .default(true)
    .describe('When true, include PageSpeed performance signal in scoring.'),
});

export type RecommendNextActionsInput = z.infer<typeof RecommendNextActionsSchema>;
