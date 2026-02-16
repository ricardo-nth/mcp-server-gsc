import { z } from 'zod';

/** Shared siteUrl field used across most tools */
export const SiteUrlSchema = z.object({
  siteUrl: z
    .string()
    .describe(
      'The site URL as defined in Search Console. Examples: sc-domain:example.com (domain property) or https://www.example.com/ (URL-prefix property)',
    ),
});

/**
 * Flexible date range: either explicit startDate/endDate or `days` for a
 * relative range ending yesterday. If `days` is provided, it takes precedence.
 */
export const DateRangeSchema = z.object({
  startDate: z.string().optional().describe('Start date (YYYY-MM-DD). Optional if `days` is provided.'),
  endDate: z.string().optional().describe('End date (YYYY-MM-DD). Optional if `days` is provided.'),
  days: z
    .number()
    .min(1)
    .max(180)
    .optional()
    .describe(
      'Relative date range in days ending yesterday. Alternative to startDate/endDate.',
    ),
});

/** Dimensions that can be used to break down analytics */
export const DimensionValues = [
  'query',
  'page',
  'country',
  'device',
  'date',
  'searchAppearance',
] as const;

export type Dimension = (typeof DimensionValues)[number];

/** Search types supported by the API */
export const SearchTypeValues = [
  'web',
  'image',
  'video',
  'news',
  'discover',
  'googleNews',
] as const;

export type SearchType = (typeof SearchTypeValues)[number];

/** Aggregation types */
export const AggregationTypeValues = [
  'auto',
  'byNewsShowcasePanel',
  'byProperty',
  'byPage',
] as const;

/** Filter operators */
export const FilterOperatorValues = [
  'equals',
  'contains',
  'notEquals',
  'notContains',
  'includingRegex',
  'excludingRegex',
] as const;

/** Data freshness state */
export const DataStateValues = ['final', 'all'] as const;

/** Device types for filtering */
export const DeviceValues = ['DESKTOP', 'MOBILE', 'TABLET'] as const;
