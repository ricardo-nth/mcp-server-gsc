import { z } from 'zod';
import { DateRangeSchema, SiteUrlSchema } from './base.js';

const AUDIT_PROFILES = ['technical', 'content', 'indexing'] as const;

export const RunSeoAuditWorkflowSchema = SiteUrlSchema.merge(DateRangeSchema).extend({
  profile: z
    .enum(AUDIT_PROFILES)
    .optional()
    .default('technical')
    .describe('Workflow profile: technical, content, or indexing.'),
  topN: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(25)
    .describe('Maximum URLs analyzed for indexing-heavy steps.'),
  rowLimit: z
    .number()
    .min(100)
    .max(5000)
    .optional()
    .default(1000)
    .describe('Row limit for analytics-driven steps.'),
  urls: z
    .array(z.string().url('Each URL must be fully-qualified (e.g. https://example.com/page)'))
    .max(100)
    .optional()
    .describe('Optional manual URLs for indexing profile and report enrichment.'),
  sitemapUrls: z
    .array(z.string().url('Each sitemap URL must be fully-qualified (e.g. https://example.com/sitemap.xml)'))
    .max(20)
    .optional()
    .describe('Optional sitemap URLs used by technical/indexing profiles.'),
  sampleUrl: z
    .string()
    .url('Must be a fully-qualified URL (e.g. https://example.com/page)')
    .optional()
    .describe('Optional page URL for page_health_dashboard step.'),
  markdown: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include a markdown-ready report body in the response.'),
});

export type RunSeoAuditWorkflowInput = z.infer<typeof RunSeoAuditWorkflowSchema>;
