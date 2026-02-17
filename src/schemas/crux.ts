import { z } from 'zod';

const FORM_FACTORS = ['PHONE', 'DESKTOP', 'TABLET'] as const;
const CRUX_METRICS = [
  'first_contentful_paint',
  'largest_contentful_paint',
  'cumulative_layout_shift',
  'experimental_interaction_to_next_paint',
  'experimental_time_to_first_byte',
  'first_input_delay',
] as const;

const CrUXBaseSchema = z.object({
  url: z
    .string()
    .optional()
    .describe('A specific URL to query. Provide either url or origin, not both.'),
  origin: z
    .string()
    .optional()
    .describe('An origin to query (e.g. "https://example.com"). Provide either url or origin, not both.'),
  formFactor: z
    .enum(FORM_FACTORS)
    .optional()
    .describe('Device form factor filter: PHONE, DESKTOP, or TABLET. Omit for aggregated data across all form factors.'),
  metrics: z
    .array(z.enum(CRUX_METRICS))
    .optional()
    .describe('Specific metrics to return. Omit for all available metrics. Options: first_contentful_paint, largest_contentful_paint, cumulative_layout_shift, experimental_interaction_to_next_paint, experimental_time_to_first_byte, first_input_delay'),
}).refine(
  (data) => data.url || data.origin,
  { message: 'Either "url" or "origin" must be provided' },
);

/** crux_query tool schema */
export const CrUXQuerySchema = CrUXBaseSchema;

/** crux_history tool schema */
export const CrUXHistorySchema = CrUXBaseSchema;

export type CrUXQueryInput = z.infer<typeof CrUXQuerySchema>;
export type CrUXHistoryInput = z.infer<typeof CrUXHistorySchema>;
