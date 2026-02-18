import { z } from 'zod';
import { SiteUrlSchema, DateRangeSchema } from './base.js';

const PSI_CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'] as const;
const PSI_STRATEGIES = ['mobile', 'desktop'] as const;

/** page_health_dashboard tool schema */
export const PageHealthDashboardSchema = SiteUrlSchema.merge(DateRangeSchema).extend({
  url: z
    .string()
    .url('Must be a fully-qualified URL (e.g. https://example.com/page)')
    .describe('The specific page URL to check (full URL including protocol)'),
  strategy: z
    .enum(PSI_STRATEGIES)
    .optional()
    .default('mobile')
    .describe('PageSpeed strategy: mobile (default) or desktop'),
  categories: z
    .array(z.enum(PSI_CATEGORIES))
    .min(1, 'At least one Lighthouse category is required')
    .optional()
    .default(['performance'])
    .describe('Lighthouse categories for PSI audit'),
  languageCode: z
    .string()
    .optional()
    .default('en-US')
    .describe('Language code for inspection messages'),
});

/** indexing_health_report tool schema */
export const IndexingHealthReportSchema = SiteUrlSchema.merge(DateRangeSchema).extend({
  source: z
    .enum(['analytics'] as const)
    .optional()
    .default('analytics')
    .describe('URL source: "analytics" (top pages by clicks)'),
  topN: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(50)
    .describe('Maximum URLs to inspect (max 100, respects 2000/day API quota)'),
  languageCode: z
    .string()
    .optional()
    .default('en-US')
    .describe('Language code for inspection messages'),
});

/** serp_feature_tracking tool schema */
export const SerpFeatureTrackingSchema = SiteUrlSchema.merge(DateRangeSchema).extend({
  rowLimit: z
    .number()
    .min(1)
    .max(25000)
    .optional()
    .default(5000)
    .describe('Max rows to fetch from search analytics'),
});

/** cannibalization_resolver tool schema */
export const CannibalizationResolverSchema = SiteUrlSchema.merge(DateRangeSchema).extend({
  minImpressions: z
    .number()
    .optional()
    .default(10)
    .describe('Minimum total impressions for a query to qualify'),
  rowLimit: z
    .number()
    .min(1)
    .max(25000)
    .optional()
    .default(10000)
    .describe('Max rows to fetch'),
  includeRecommendation: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to include winner/action recommendations (default true)'),
});

/** drop_alerts tool schema — uses own `days` field, not DateRangeSchema,
 *  because comparePeriods() requires a single window size, not start/end. */
export const DropAlertsSchema = SiteUrlSchema.extend({
  threshold: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(50)
    .describe('Minimum % click drop to flag (default 50)'),
  minClicks: z
    .number()
    .optional()
    .default(10)
    .describe('Minimum clicks in prior period for a page to qualify'),
  days: z
    .number()
    .min(1)
    .max(90)
    .optional()
    .default(7)
    .describe('Comparison window in days (default 7)'),
  rowLimit: z
    .number()
    .min(1)
    .max(25000)
    .optional()
    .default(5000)
    .describe('Max rows per period query'),
});

export type PageHealthDashboardInput = z.infer<typeof PageHealthDashboardSchema>;
export type IndexingHealthReportInput = z.infer<typeof IndexingHealthReportSchema>;
export type SerpFeatureTrackingInput = z.infer<typeof SerpFeatureTrackingSchema>;
export type CannibalizationResolverInput = z.infer<typeof CannibalizationResolverSchema>;
export type DropAlertsInput = z.infer<typeof DropAlertsSchema>;
