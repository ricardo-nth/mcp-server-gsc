import { z, type ZodTypeAny } from 'zod';

import {
  SearchAnalyticsSchema,
  EnhancedSearchAnalyticsSchema,
  QuickWinsSchema,
  SearchAnalyticsCursorSchema,
} from './schemas/analytics.js';
import { RecommendNextActionsSchema } from './schemas/recommendations.js';
import { RunSeoAuditWorkflowSchema } from './schemas/workflow.js';
import { IndexInspectSchema } from './schemas/inspection.js';
import {
  ListSitemapsSchema,
  GetSitemapSchema,
  SubmitSitemapSchema,
  DeleteSitemapSchema,
} from './schemas/sitemaps.js';
import {
  ComparePeriodsSchema,
  ContentDecaySchema,
  CannibalizationSchema,
  DiffKeywordsSchema,
  BatchInspectSchema,
  CtrAnalysisSchema,
  SearchTypeBreakdownSchema,
} from './schemas/computed.js';
import { GetSiteSchema, AddSiteSchema, DeleteSiteSchema } from './schemas/sites.js';
import { MobileFriendlyTestSchema } from './schemas/mobilefriendly.js';
import { PageSpeedInsightsSchema } from './schemas/pagespeed.js';
import { IndexingPublishSchema, IndexingStatusSchema } from './schemas/indexing.js';
import { CrUXQuerySchema, CrUXHistorySchema } from './schemas/crux.js';
import { HealthSnapshotSchema } from './schemas/operations.js';
import {
  PageHealthDashboardSchema,
  IndexingHealthReportSchema,
  SerpFeatureTrackingSchema,
  CannibalizationResolverSchema,
  DropAlertsSchema,
} from './schemas/computed2.js';

export type ToolGroupId = 'core' | 'operations' | 'computed' | 'multiApi' | 'adjacent';

export interface ToolHints {
  latencyHint: string;
  costHint: string;
  quotaHint: string;
}

export interface ToolRegistryEntry {
  name: string;
  group: ToolGroupId;
  description: string;
  schema: ZodTypeAny;
  example?: Record<string, unknown>;
  hints?: ToolHints;
  mutating?: boolean;
  cacheable?: boolean;
}

export const TOOL_GROUPS: Array<{
  id: ToolGroupId;
  title: string;
  readmeDescription?: string;
}> = [
  {
    id: 'core',
    title: 'Core',
  },
  {
    id: 'operations',
    title: 'Operations',
  },
  {
    id: 'computed',
    title: 'Computed Intelligence',
    readmeDescription:
      'Single-API tools that combine multiple queries into structured analysis.',
  },
  {
    id: 'multiApi',
    title: 'Multi-API Intelligence',
    readmeDescription:
      'Tools that combine data from multiple Google APIs in a single call, using `Promise.allSettled` for partial-failure tolerance.',
  },
  {
    id: 'adjacent',
    title: 'Adjacent APIs',
    readmeDescription:
      'Direct access to related Google APIs.',
  },
];

export const DEFAULT_TOOL_HINTS: ToolHints = {
  latencyHint: 'medium',
  costHint: 'low',
  quotaHint: 'Standard API quota applies for this endpoint.',
};

export const TOOL_REGISTRY: ToolRegistryEntry[] = [
  {
    name: 'list_sites',
    group: 'core',
    description: 'List all sites available in Google Search Console',
    schema: z.object({}),
  },
  {
    name: 'gsc_healthcheck',
    group: 'core',
    description:
      'Quick preflight check for agent workflows: validates Search Console auth by listing sites and reports optional API key availability.',
    schema: z.object({}),
  },
  {
    name: 'health_snapshot',
    group: 'operations',
    description:
      'Runtime diagnostics snapshot for operations: cache/idempotency state, concurrency queues, quota guardrails, provider registry status, and per-tool success/failure counters.',
    schema: HealthSnapshotSchema,
    example: {
      includeToolMetrics: true,
    },
    hints: {
      latencyHint: 'low',
      costHint: 'low',
      quotaHint: 'No external API quota consumed; reports in-memory runtime diagnostics.',
    },
    cacheable: false,
  },
  {
    name: 'search_analytics',
    group: 'core',
    description:
      'Query search performance data (clicks, impressions, CTR, position) with filtering by page, query, country, device, and search type',
    schema: SearchAnalyticsSchema,
    example: {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      dimensions: ['query', 'page'],
      rowLimit: 1000,
      mode: 'compact',
    },
  },
  {
    name: 'search_analytics_cursor',
    group: 'core',
    description:
      'Cursor-based retrieval for large analytics datasets. Returns one page of rows and a nextCursor token for incremental fetches up to 100K rows.',
    schema: SearchAnalyticsCursorSchema,
    example: {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      dimensions: ['query', 'page'],
      pageSize: 5000,
      maxRows: 100000,
      mode: 'compact',
    },
    hints: {
      latencyHint: 'medium',
      costHint: 'low',
      quotaHint:
        'Optimized for high-volume retrieval; iterate using nextCursor instead of requesting one huge payload.',
    },
  },
  {
    name: 'enhanced_search_analytics',
    group: 'core',
    description:
      'Advanced search analytics with regex filters, optional auto-pagination up to 100K rows, and optional quick-wins detection',
    schema: EnhancedSearchAnalyticsSchema,
    example: {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      regexFilter: 'brand|pricing',
      maxRows: 50000,
      mode: 'compact',
    },
  },
  {
    name: 'detect_quick_wins',
    group: 'core',
    description:
      'Find SEO quick-win opportunities: high-impression, low-CTR queries in striking distance (positions 4-10), with optional auto-pagination up to 100K rows',
    schema: QuickWinsSchema,
  },
  {
    name: 'recommend_next_actions',
    group: 'core',
    description:
      'Generate deterministic ranked SEO actions by combining click upside, impression volume, rank distance, indexing health, CWV quality, branded segmentation, and page template grouping.',
    schema: RecommendNextActionsSchema,
    example: {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      topActions: 5,
      minImpressions: 100,
      brandTerms: ['example'],
      includeCwv: true,
    },
  },
  {
    name: 'run_seo_audit_workflow',
    group: 'core',
    description:
      'Run a profile-based SEO audit orchestrator (technical, content, indexing) and return executive summary, issues/actions with ownership metadata, a shared report contract, and optional markdown and/or branded HTML report output.',
    schema: RunSeoAuditWorkflowSchema,
    example: {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      profile: 'technical',
      reportFormat: 'all',
      detailMode: 'client',
      reportPack: 'technical_audit',
      brand: {
        name: 'Nth Agency',
        accentColor: '#0F172A',
      },
    },
  },
  {
    name: 'index_inspect',
    group: 'core',
    description:
      'Inspect a URL for indexing status, crawl info, mobile usability, and rich results',
    schema: IndexInspectSchema,
    example: {
      siteUrl: 'sc-domain:example.com',
      url: 'https://example.com/pricing',
      mode: 'full',
    },
  },
  {
    name: 'list_sitemaps',
    group: 'core',
    description: 'List all sitemaps submitted for a site',
    schema: ListSitemapsSchema,
  },
  {
    name: 'get_sitemap',
    group: 'core',
    description: 'Get details of a specific sitemap',
    schema: GetSitemapSchema,
  },
  {
    name: 'submit_sitemap',
    group: 'core',
    description: 'Submit a new sitemap to Google Search Console',
    schema: SubmitSitemapSchema,
    mutating: true,
  },
  {
    name: 'delete_sitemap',
    group: 'core',
    description: 'Delete a sitemap from Google Search Console',
    schema: DeleteSitemapSchema,
    mutating: true,
  },
  {
    name: 'compare_periods',
    group: 'computed',
    description:
      'Compare two time periods side-by-side with delta and % change for clicks, impressions, CTR, and position',
    schema: ComparePeriodsSchema,
    example: {
      siteUrl: 'sc-domain:example.com',
      days: 14,
      dimensions: ['query'],
      rowLimit: 500,
    },
  },
  {
    name: 'detect_content_decay',
    group: 'computed',
    description:
      'Find pages losing clicks over time by comparing recent vs earlier performance, sorted by traffic loss',
    schema: ContentDecaySchema,
  },
  {
    name: 'detect_cannibalization',
    group: 'computed',
    description:
      'Find queries where multiple pages compete for the same keyword, with position variance analysis',
    schema: CannibalizationSchema,
  },
  {
    name: 'diff_keywords',
    group: 'computed',
    description:
      'Discover new and lost keywords by comparing two time periods',
    schema: DiffKeywordsSchema,
  },
  {
    name: 'batch_inspect',
    group: 'computed',
    description:
      'Inspect multiple URLs for indexing status (rate-limited to 1/sec, max 100 URLs)',
    schema: BatchInspectSchema,
    hints: {
      latencyHint: 'high',
      costHint: 'medium',
      quotaHint: 'Consumes 1 URL Inspection quota per URL (max 100/request).',
    },
  },
  {
    name: 'ctr_analysis',
    group: 'computed',
    description:
      'Analyze CTR vs position benchmarks to find underperforming queries that could benefit from title/description optimization',
    schema: CtrAnalysisSchema,
  },
  {
    name: 'search_type_breakdown',
    group: 'computed',
    description:
      'Compare performance across search types (web, image, video, discover, news) in a single call',
    schema: SearchTypeBreakdownSchema,
  },
  {
    name: 'page_health_dashboard',
    group: 'multiApi',
    description:
      'Comprehensive page health check combining URL Inspection (indexing status, canonical), Search Analytics (clicks, impressions, CTR, position), PageSpeed Insights (Lighthouse scores), and CrUX (real-user Core Web Vitals) in a single call. CrUX is optional (requires GOOGLE_CLOUD_API_KEY).',
    schema: PageHealthDashboardSchema,
    example: {
      siteUrl: 'sc-domain:example.com',
      url: 'https://example.com/blog/post',
      days: 28,
    },
  },
  {
    name: 'indexing_health_report',
    group: 'multiApi',
    description:
      'Batch-check indexing status across site pages. Gets top URLs from search analytics, rate-limited inspects each (1 req/sec), and aggregates: indexed count, not-indexed count, errors, by coverage state. Max 100 URLs per call. Reports quotaUsed for tracking against 2000/day limit.',
    schema: IndexingHealthReportSchema,
    example: {
      siteUrl: 'sc-domain:example.com',
      source: 'manual',
      urls: ['https://example.com/', 'https://example.com/pricing'],
      mode: 'compact',
    },
    hints: {
      latencyHint: 'high',
      costHint: 'medium',
      quotaHint: 'Uses URL Inspection API quota (2,000/day per property).',
    },
  },
  {
    name: 'serp_feature_tracking',
    group: 'multiApi',
    description:
      'Track SERP features (rich results, FAQs, videos, AMP, etc.) over time using the searchAppearance dimension. Shows daily trends per feature type.',
    schema: SerpFeatureTrackingSchema,
  },
  {
    name: 'cannibalization_resolver',
    group: 'multiApi',
    description:
      'Detect keyword cannibalization AND recommend actions: identifies the winner URL per query and adds intent, brand/template context, severity, and stronger redirect/consolidate/differentiate guidance.',
    schema: CannibalizationResolverSchema,
  },
  {
    name: 'drop_alerts',
    group: 'multiApi',
    description:
      'Detect pages with significant traffic drops by comparing recent vs previous period. Flags pages exceeding a configurable % threshold (default 50%), sorted by absolute click loss.',
    schema: DropAlertsSchema,
  },
  {
    name: 'get_site',
    group: 'adjacent',
    description:
      'Get details for a specific site property in Search Console (permission level, URL)',
    schema: GetSiteSchema,
  },
  {
    name: 'add_site',
    group: 'adjacent',
    description: 'Add a new site property to Google Search Console',
    schema: AddSiteSchema,
    mutating: true,
  },
  {
    name: 'delete_site',
    group: 'adjacent',
    description: 'Remove a site property from Google Search Console',
    schema: DeleteSiteSchema,
    mutating: true,
  },
  {
    name: 'mobile_friendly_test',
    group: 'adjacent',
    description:
      'Test a URL for mobile-friendliness and get issues with optional screenshot',
    schema: MobileFriendlyTestSchema,
  },
  {
    name: 'pagespeed_insights',
    group: 'adjacent',
    description:
      'Run Google PageSpeed Insights (Lighthouse) analysis on a URL — scores, field data, and diagnostics. No auth required.',
    schema: PageSpeedInsightsSchema,
  },
  {
    name: 'indexing_publish',
    group: 'adjacent',
    description:
      'Notify Google that a URL has been updated or deleted for faster crawling (Indexing API, 200/day quota). Note: officially limited to JobPosting/BroadcastEvent schema types.',
    schema: IndexingPublishSchema,
    hints: {
      latencyHint: 'low',
      costHint: 'high',
      quotaHint: 'Indexing API default quota is roughly 200 publish calls/day.',
    },
    mutating: true,
  },
  {
    name: 'indexing_status',
    group: 'adjacent',
    description:
      'Get Indexing API notification metadata for a URL — shows latest update/remove notifications. URL must have been previously submitted via indexing_publish.',
    schema: IndexingStatusSchema,
  },
  {
    name: 'crux_query',
    group: 'adjacent',
    description:
      'Query Chrome UX Report for Core Web Vitals (LCP, CLS, INP, FCP, TTFB) by URL or origin. Requires GOOGLE_CLOUD_API_KEY env var.',
    schema: CrUXQuerySchema,
    hints: {
      latencyHint: 'low',
      costHint: 'low',
      quotaHint: 'Requires GOOGLE_CLOUD_API_KEY and CrUX API quota in Google Cloud.',
    },
  },
  {
    name: 'crux_history',
    group: 'adjacent',
    description:
      'Query Chrome UX Report 40-week rolling history for Core Web Vitals trends by URL or origin. Requires GOOGLE_CLOUD_API_KEY env var.',
    schema: CrUXHistorySchema,
    hints: {
      latencyHint: 'medium',
      costHint: 'low',
      quotaHint: 'Requires GOOGLE_CLOUD_API_KEY and CrUX API quota in Google Cloud.',
    },
  },
];

export const TOOL_NAME_SET = new Set(TOOL_REGISTRY.map((tool) => tool.name));
export const MUTATING_TOOLS = new Set(
  TOOL_REGISTRY.filter((tool) => tool.mutating).map((tool) => tool.name),
);
export const NON_CACHEABLE_TOOLS = new Set(
  TOOL_REGISTRY.filter((tool) => tool.cacheable === false).map((tool) => tool.name),
);
