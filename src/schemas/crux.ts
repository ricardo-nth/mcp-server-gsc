import { z } from 'zod';

const FORM_FACTORS = ['PHONE', 'DESKTOP', 'TABLET'] as const;
const CRUX_METRICS = [
  'first_contentful_paint',
  'largest_contentful_paint',
  'cumulative_layout_shift',
  'interaction_to_next_paint',
  'experimental_time_to_first_byte',
  'round_trip_time',
  'form_factors',
  'navigation_types',
] as const;

const cruxFields = {
  url: z
    .string()
    .url('Must be a fully-qualified URL (e.g. https://example.com/page)')
    .optional()
    .describe('A specific URL to query. Provide either url or origin, not both.'),
  origin: z
    .string()
    .url('Must be a fully-qualified origin URL (e.g. https://example.com)')
    .optional()
    .describe('An origin to query (e.g. "https://example.com"). Provide either url or origin, not both.'),
  formFactor: z
    .enum(FORM_FACTORS)
    .optional()
    .describe('Device form factor filter: PHONE, DESKTOP, or TABLET. Omit for aggregated data across all form factors.'),
  metrics: z
    .array(z.enum(CRUX_METRICS))
    .optional()
    .describe('Specific metrics to return. Omit for all available metrics.'),
};

const cruxRefine = (data: { url?: string; origin?: string }) =>
  Boolean(data.url) !== Boolean(data.origin);
const cruxRefineMessage = {
  message: 'Provide exactly one of "url" or "origin"',
};

/** crux_query tool schema */
export const CrUXQuerySchema = z.object(cruxFields).refine(cruxRefine, cruxRefineMessage);

/** crux_history tool schema */
export const CrUXHistorySchema = z.object(cruxFields).refine(cruxRefine, cruxRefineMessage);

export type CrUXQueryInput = z.infer<typeof CrUXQuerySchema>;
export type CrUXHistoryInput = z.infer<typeof CrUXHistorySchema>;
