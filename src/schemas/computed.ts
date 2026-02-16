import { z } from 'zod';
import { SiteUrlSchema, DateRangeSchema, SearchTypeValues, DeviceValues } from './base.js';

/** compare_periods tool schema */
export const ComparePeriodsSchema = SiteUrlSchema.extend({
  days: z
    .number()
    .min(1)
    .max(90)
    .default(28)
    .describe(
      'Length of each period in days. Two equal periods are compared: recent vs previous.',
    ),
  dimensions: z
    .array(z.enum(['query', 'page', 'country', 'device'] as const))
    .optional()
    .describe('Dimensions to group by'),
  type: z
    .enum(SearchTypeValues)
    .optional()
    .describe('Search type filter'),
  deviceFilter: z
    .enum(DeviceValues)
    .optional()
    .describe('Device filter'),
  rowLimit: z
    .number()
    .min(1)
    .max(25000)
    .default(1000)
    .describe('Max rows per period'),
});

/** detect_content_decay tool schema */
export const ContentDecaySchema = SiteUrlSchema.extend({
  days: z
    .number()
    .min(14)
    .max(180)
    .default(56)
    .describe('Total lookback period in days (split into two halves for comparison)'),
  minClicksInPrior: z
    .number()
    .default(10)
    .describe('Minimum clicks in the earlier period to qualify'),
  rowLimit: z
    .number()
    .min(1)
    .max(25000)
    .default(5000)
    .describe('Max rows per period query'),
});

/** detect_cannibalization tool schema */
export const CannibalizationSchema = SiteUrlSchema.merge(DateRangeSchema).extend({
  minImpressions: z
    .number()
    .default(10)
    .describe('Minimum total impressions for a query to qualify'),
  rowLimit: z
    .number()
    .min(1)
    .max(25000)
    .default(10000)
    .describe('Max rows to fetch'),
});

/** diff_keywords tool schema */
export const DiffKeywordsSchema = SiteUrlSchema.extend({
  days: z
    .number()
    .min(1)
    .max(90)
    .default(28)
    .describe('Period length for comparison (recent vs previous)'),
  minImpressions: z
    .number()
    .default(5)
    .describe('Minimum impressions in either period'),
  rowLimit: z
    .number()
    .min(1)
    .max(25000)
    .default(5000)
    .describe('Max rows per period'),
});

/** batch_inspect tool schema */
export const BatchInspectSchema = SiteUrlSchema.extend({
  urls: z
    .array(z.string())
    .min(1)
    .max(100)
    .describe('URLs to inspect (max 100)'),
  languageCode: z
    .string()
    .optional()
    .default('en-US')
    .describe('Language for translated messages'),
});

/** ctr_analysis tool schema */
export const CtrAnalysisSchema = SiteUrlSchema.merge(DateRangeSchema).extend({
  minImpressions: z
    .number()
    .default(50)
    .describe('Minimum impressions to include a query'),
  rowLimit: z
    .number()
    .min(1)
    .max(25000)
    .default(5000)
    .describe('Max rows to fetch'),
});

/** search_type_breakdown tool schema */
export const SearchTypeBreakdownSchema = SiteUrlSchema.merge(DateRangeSchema).extend({
  types: z
    .array(z.enum(SearchTypeValues))
    .optional()
    .default(['web', 'image', 'video', 'discover', 'news'])
    .describe('Search types to compare'),
});

export type ComparePeriodsInput = z.infer<typeof ComparePeriodsSchema>;
export type ContentDecayInput = z.infer<typeof ContentDecaySchema>;
export type CannibalizationInput = z.infer<typeof CannibalizationSchema>;
export type DiffKeywordsInput = z.infer<typeof DiffKeywordsSchema>;
export type BatchInspectInput = z.infer<typeof BatchInspectSchema>;
export type CtrAnalysisInput = z.infer<typeof CtrAnalysisSchema>;
export type SearchTypeBreakdownInput = z.infer<typeof SearchTypeBreakdownSchema>;
