import { z } from 'zod';
import { DateRangeSchema, SiteUrlSchema } from './base.js';

const AUDIT_PROFILES = ['technical', 'content', 'indexing'] as const;
const REPORT_FORMATS = ['json', 'markdown', 'html', 'all'] as const;
const REPORT_PACKS = [
  'monthly_seo',
  'technical_audit',
  'indexing_recovery',
  'content_opportunities',
] as const;
const DETAIL_MODES = ['client', 'analyst', 'both'] as const;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

const ReportBrandSchema = z.object({
  name: z.string().min(1, 'Brand name cannot be empty.'),
  logoUrl: z
    .string()
    .url('Brand logoUrl must be a fully-qualified URL (e.g. https://example.com/logo.png)')
    .optional(),
  accentColor: z
    .string()
    .regex(HEX_COLOR_PATTERN, 'Brand accentColor must be a hex color like #0F172A.')
    .optional(),
});

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
  reportFormat: z
    .enum(REPORT_FORMATS)
    .optional()
    .describe('Workflow report output: json (default), markdown, html, or all.'),
  reportPack: z
    .enum(REPORT_PACKS)
    .optional()
    .describe(
      'Optional report presentation preset metadata for monthly SEO, technical audit, indexing recovery, or content opportunity workflows.',
    ),
  detailMode: z
    .enum(DETAIL_MODES)
    .optional()
    .default('client')
    .describe('Audience detail level for the shared report payload: client, analyst, or both.'),
  brand: ReportBrandSchema.optional().describe(
    'Optional brand metadata carried through the workflow report contract.',
  ),
  markdown: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Legacy alias for markdown report output. Ignored when reportFormat is provided.',
    ),
});

export type RunSeoAuditWorkflowInput = z.infer<typeof RunSeoAuditWorkflowSchema>;
