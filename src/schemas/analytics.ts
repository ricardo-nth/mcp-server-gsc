import { z } from 'zod';
import {
  SiteUrlSchema,
  DateRangeSchema,
  DimensionValues,
  SearchTypeValues,
  AggregationTypeValues,
  FilterOperatorValues,
  DataStateValues,
  DeviceValues,
} from './base.js';

/** search_analytics tool schema */
export const SearchAnalyticsSchema = SiteUrlSchema.merge(DateRangeSchema).extend(
  {
    dimensions: z
      .array(z.enum(DimensionValues))
      .optional()
      .describe(
        'Dimensions to group results by: query, page, country, device, date, searchAppearance',
      ),
    type: z
      .enum(SearchTypeValues)
      .optional()
      .describe(
        'Search type filter: web, image, video, news, discover, googleNews',
      ),
    aggregationType: z
      .enum(AggregationTypeValues)
      .optional()
      .describe('Aggregation type: auto, byNewsShowcasePanel, byProperty, byPage'),
    dataState: z
      .enum(DataStateValues)
      .optional()
      .describe(
        'Data freshness: "final" (default, 2-3 day lag) or "all" (includes fresh/unfinished data)',
      ),
    rowLimit: z
      .number()
      .min(1)
      .max(25000)
      .default(1000)
      .describe('Max rows to return (1-25000, default 1000)'),
    startRow: z
      .number()
      .min(0)
      .optional()
      .describe('Zero-based row offset for pagination'),
    pageFilter: z
      .string()
      .optional()
      .describe('Filter by page URL (uses filterOperator)'),
    queryFilter: z
      .string()
      .optional()
      .describe('Filter by query string (uses filterOperator)'),
    countryFilter: z
      .string()
      .optional()
      .describe('Filter by country (ISO 3166-1 alpha-3, e.g. USA, GBR)'),
    deviceFilter: z
      .enum(DeviceValues)
      .optional()
      .describe('Filter by device: DESKTOP, MOBILE, TABLET'),
    filterOperator: z
      .enum(FilterOperatorValues)
      .default('equals')
      .optional()
      .describe(
        'Operator for page/query filters: equals, contains, notEquals, notContains, includingRegex, excludingRegex',
      ),
  },
);

/** enhanced_search_analytics tool schema — adds regex + quick wins on top of base analytics */
export const EnhancedSearchAnalyticsSchema = SearchAnalyticsSchema.extend({
  regexFilter: z
    .string()
    .optional()
    .describe('Additional regex filter applied to queries'),
  enableQuickWins: z
    .boolean()
    .default(false)
    .describe('Enable automatic quick-wins detection in the response'),
  quickWinsThresholds: z
    .object({
      minImpressions: z.number().default(50).describe('Min impressions for a quick win'),
      maxCtr: z.number().default(2.0).describe('Max CTR % for a quick win'),
      positionRangeMin: z.number().default(4).describe('Min average position'),
      positionRangeMax: z.number().default(10).describe('Max average position'),
    })
    .optional()
    .describe('Custom thresholds for quick-wins detection'),
  maxRows: z
    .number()
    .min(1)
    .max(100000)
    .optional()
    .default(25000)
    .describe(
      'Maximum total rows to fetch with auto-pagination. Values above rowLimit fetch additional pages (up to 100000).',
    ),
});

/** detect_quick_wins tool schema */
export const QuickWinsSchema = SiteUrlSchema.merge(DateRangeSchema).extend({
  minImpressions: z.number().default(50).describe('Min impressions threshold'),
  maxCtr: z.number().default(2.0).describe('Max CTR % threshold'),
  positionRangeMin: z.number().default(4).describe('Min position'),
  positionRangeMax: z.number().default(10).describe('Max position'),
  maxRows: z
    .number()
    .min(1)
    .max(100000)
    .optional()
    .default(25000)
    .describe(
      'Maximum total rows to fetch with auto-pagination (default 25000, max 100000).',
    ),
});

export type SearchAnalyticsInput = z.infer<typeof SearchAnalyticsSchema>;
export type EnhancedSearchAnalyticsInput = z.infer<typeof EnhancedSearchAnalyticsSchema>;
export type QuickWinsInput = z.infer<typeof QuickWinsSchema>;
