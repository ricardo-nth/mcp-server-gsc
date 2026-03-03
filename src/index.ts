#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
// @ts-ignore — no types shipped
import { zodToJsonSchema } from 'zod-to-json-schema';

import { GSCError, SearchConsoleService } from './service.js';
import {
  errorResult,
  jsonResult,
  toEnvelopedResult,
  type ResponseMode,
  type ResponseSummary,
  type ToolResult,
} from './utils/types.js';

// Schemas
import {
  SearchAnalyticsSchema,
  EnhancedSearchAnalyticsSchema,
  QuickWinsSchema,
  SearchAnalyticsCursorSchema,
} from './schemas/analytics.js';
import { RecommendNextActionsSchema } from './schemas/recommendations.js';
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
import {
  PageHealthDashboardSchema,
  IndexingHealthReportSchema,
  SerpFeatureTrackingSchema,
  CannibalizationResolverSchema,
  DropAlertsSchema,
} from './schemas/computed2.js';

// Tool handlers
import {
  handleListSites,
  handleSearchAnalytics,
  handleEnhancedSearchAnalytics,
  handleDetectQuickWins,
  handleSearchAnalyticsCursor,
} from './tools/analytics.js';
import { handleRecommendNextActions } from './tools/recommendations.js';
import { handleIndexInspect } from './tools/inspection.js';
import {
  handleListSitemaps,
  handleGetSitemap,
  handleSubmitSitemap,
  handleDeleteSitemap,
} from './tools/sitemaps.js';
import {
  handleComparePeriods,
  handleContentDecay,
  handleCannibalization,
  handleDiffKeywords,
  handleBatchInspect,
  handleCtrAnalysis,
  handleSearchTypeBreakdown,
} from './tools/computed.js';
import { handleGetSite, handleAddSite, handleDeleteSite } from './tools/sites.js';
import { handleMobileFriendlyTest } from './tools/mobilefriendly.js';
import { handlePageSpeedInsights } from './tools/pagespeed.js';
import { handleIndexingPublish, handleIndexingStatus } from './tools/indexing.js';
import { handleCrUXQuery, handleCrUXHistory } from './tools/crux.js';
import {
  handlePageHealthDashboard,
  handleIndexingHealthReport,
  handleSerpFeatureTracking,
  handleCannibalizationResolver,
  handleDropAlerts,
} from './tools/computed2.js';
import {
  RuntimeCoordinator,
  type CacheMeta,
  type IdempotencyMeta,
} from './utils/runtime.js';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    'GOOGLE_APPLICATION_CREDENTIALS environment variable is required',
  );
  process.exit(1);
}

const GOOGLE_CLOUD_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;
// Optional — only needed for CrUX tools. Server starts fine without it.

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'mcp-server-gsc-pro', version: '1.2.1' },
  { capabilities: { tools: {} } },
);

const RESPONSE_SCHEMA_VERSION = '1.0.0';
const runtime = new RuntimeCoordinator();

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ReturnType<typeof zodToJsonSchema>;
};

const TOOL_HINTS: Record<string, { latencyHint: string; costHint: string; quotaHint: string }> = {
  search_analytics_cursor: {
    latencyHint: 'medium',
    costHint: 'low',
    quotaHint: 'Optimized for high-volume retrieval; iterate using nextCursor instead of requesting one huge payload.',
  },
  batch_inspect: {
    latencyHint: 'high',
    costHint: 'medium',
    quotaHint: 'Consumes 1 URL Inspection quota per URL (max 100/request).',
  },
  indexing_health_report: {
    latencyHint: 'high',
    costHint: 'medium',
    quotaHint: 'Uses URL Inspection API quota (2,000/day per property).',
  },
  indexing_publish: {
    latencyHint: 'low',
    costHint: 'high',
    quotaHint: 'Indexing API default quota is roughly 200 publish calls/day.',
  },
  crux_query: {
    latencyHint: 'low',
    costHint: 'low',
    quotaHint: 'Requires GOOGLE_CLOUD_API_KEY and CrUX API quota in Google Cloud.',
  },
  crux_history: {
    latencyHint: 'medium',
    costHint: 'low',
    quotaHint: 'Requires GOOGLE_CLOUD_API_KEY and CrUX API quota in Google Cloud.',
  },
};

const TOOL_EXAMPLES: Record<string, Record<string, unknown>> = {
  search_analytics: {
    siteUrl: 'sc-domain:example.com',
    days: 28,
    dimensions: ['query', 'page'],
    rowLimit: 1000,
    mode: 'compact',
  },
  recommend_next_actions: {
    siteUrl: 'sc-domain:example.com',
    days: 28,
    topActions: 5,
    minImpressions: 100,
    includeCwv: true,
  },
  search_analytics_cursor: {
    siteUrl: 'sc-domain:example.com',
    days: 28,
    dimensions: ['query', 'page'],
    pageSize: 5000,
    maxRows: 100000,
    mode: 'compact',
  },
  enhanced_search_analytics: {
    siteUrl: 'sc-domain:example.com',
    days: 28,
    regexFilter: 'brand|pricing',
    maxRows: 50000,
    mode: 'compact',
  },
  index_inspect: {
    siteUrl: 'sc-domain:example.com',
    url: 'https://example.com/pricing',
    mode: 'full',
  },
  compare_periods: {
    siteUrl: 'sc-domain:example.com',
    days: 14,
    dimensions: ['query'],
    rowLimit: 500,
  },
  indexing_health_report: {
    siteUrl: 'sc-domain:example.com',
    source: 'manual',
    urls: ['https://example.com/', 'https://example.com/pricing'],
    mode: 'compact',
  },
  page_health_dashboard: {
    siteUrl: 'sc-domain:example.com',
    url: 'https://example.com/blog/post',
    days: 28,
  },
};

const DEFAULT_HINTS = {
  latencyHint: 'medium',
  costHint: 'low',
  quotaHint: 'Standard API quota applies for this endpoint.',
};

const RESPONSE_MODE_SCHEMA: Record<string, unknown> = {
  type: 'string',
  enum: ['compact', 'full'],
  default: 'full',
  description:
    'Response verbosity mode. Use "compact" to reduce large arrays for lower token usage, or "full" for complete payloads.',
};

function withResponseModeInputSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = (schema.properties as Record<string, unknown> | undefined) ?? {};
  return {
    ...schema,
    properties: {
      ...properties,
      mode: RESPONSE_MODE_SCHEMA,
    },
  };
}

function getResponseMode(args: unknown): ResponseMode {
  if (args && typeof args === 'object' && (args as Record<string, unknown>).mode === 'compact') {
    return 'compact';
  }
  return 'full';
}

const VALID_TOOL_NAMES = new Set<string>();

const SUGGESTED_NEXT_TOOL: Record<string, string> = {
  list_sites: 'search_analytics',
  gsc_healthcheck: 'list_sites',
  search_analytics: 'detect_quick_wins',
  search_analytics_cursor: 'enhanced_search_analytics',
  enhanced_search_analytics: 'detect_quick_wins',
  recommend_next_actions: 'page_health_dashboard',
  detect_quick_wins: 'ctr_analysis',
  index_inspect: 'indexing_health_report',
  list_sitemaps: 'get_sitemap',
  get_sitemap: 'indexing_health_report',
  compare_periods: 'detect_content_decay',
  detect_content_decay: 'drop_alerts',
  detect_cannibalization: 'cannibalization_resolver',
  diff_keywords: 'search_analytics',
  batch_inspect: 'indexing_health_report',
  ctr_analysis: 'detect_quick_wins',
  search_type_breakdown: 'search_analytics',
  page_health_dashboard: 'pagespeed_insights',
  indexing_health_report: 'index_inspect',
  serp_feature_tracking: 'search_analytics',
  cannibalization_resolver: 'detect_cannibalization',
  drop_alerts: 'compare_periods',
  get_site: 'search_analytics',
  add_site: 'gsc_healthcheck',
  delete_site: 'list_sites',
  mobile_friendly_test: 'pagespeed_insights',
  pagespeed_insights: 'crux_query',
  indexing_publish: 'indexing_status',
  indexing_status: 'index_inspect',
  crux_query: 'crux_history',
  crux_history: 'page_health_dashboard',
};

function getSuggestedNextTool(toolName: string, isError: boolean): string | undefined {
  const candidate = isError ? 'gsc_healthcheck' : SUGGESTED_NEXT_TOOL[toolName];
  if (candidate && VALID_TOOL_NAMES.has(candidate)) {
    return candidate;
  }
  return undefined;
}

function getResponseSummary(toolName: string, isError: boolean, suggestedNextTool?: string): ResponseSummary {
  if (isError) {
    return {
      whatChanged: `${toolName} failed and returned a structured error payload.`,
      whyItMatters: 'Agents can branch deterministically on error codes/messages instead of parsing unstructured text.',
      suggestedNextTool,
    };
  }

  return {
    whatChanged: `${toolName} completed successfully.`,
    whyItMatters: 'The result can be chained into follow-up SEO diagnostics or optimization actions.',
    suggestedNextTool,
  };
}

function formatToolResult(
  toolName: string,
  mode: ResponseMode,
  requestId: string,
  result: ToolResult,
  metadata?: Record<string, unknown>,
): ToolResult {
  const suggestedNextTool = getSuggestedNextTool(toolName, Boolean(result.isError));
  return toEnvelopedResult(result, {
    schemaVersion: RESPONSE_SCHEMA_VERSION,
    requestId,
    mode,
    toolName,
    summary: getResponseSummary(toolName, Boolean(result.isError), suggestedNextTool),
    metadata,
  });
}

function getIdempotencyKey(args: unknown): string | null {
  if (!args || typeof args !== 'object') {
    return null;
  }

  const value = (args as Record<string, unknown>).idempotencyKey;
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: ToolDefinition[] = [
  {
    name: 'list_sites',
    description: 'List all sites available in Google Search Console',
    inputSchema: zodToJsonSchema(z.object({})),
  },
  {
    name: 'gsc_healthcheck',
    description:
      'Quick preflight check for agent workflows: validates Search Console auth by listing sites and reports optional API key availability.',
    inputSchema: zodToJsonSchema(z.object({})),
  },
  {
    name: 'search_analytics',
    description:
      'Query search performance data (clicks, impressions, CTR, position) with filtering by page, query, country, device, and search type',
    inputSchema: zodToJsonSchema(SearchAnalyticsSchema),
  },
  {
    name: 'search_analytics_cursor',
    description:
      'Cursor-based retrieval for large analytics datasets. Returns one page of rows and a nextCursor token for incremental fetches up to 100K rows.',
    inputSchema: zodToJsonSchema(SearchAnalyticsCursorSchema),
  },
  {
    name: 'enhanced_search_analytics',
    description:
      'Advanced search analytics with regex filters, optional auto-pagination up to 100K rows, and optional quick-wins detection',
    inputSchema: zodToJsonSchema(EnhancedSearchAnalyticsSchema),
  },
  {
    name: 'detect_quick_wins',
    description:
      'Find SEO quick-win opportunities: high-impression, low-CTR queries in striking distance (positions 4-10), with optional auto-pagination up to 100K rows',
    inputSchema: zodToJsonSchema(QuickWinsSchema),
  },
  {
    name: 'recommend_next_actions',
    description:
      'Generate deterministic ranked SEO actions by combining click upside, impression volume, rank distance, indexing health, and CWV quality.',
    inputSchema: zodToJsonSchema(RecommendNextActionsSchema),
  },
  {
    name: 'index_inspect',
    description:
      'Inspect a URL for indexing status, crawl info, mobile usability, and rich results',
    inputSchema: zodToJsonSchema(IndexInspectSchema),
  },
  {
    name: 'list_sitemaps',
    description: 'List all sitemaps submitted for a site',
    inputSchema: zodToJsonSchema(ListSitemapsSchema),
  },
  {
    name: 'get_sitemap',
    description: 'Get details of a specific sitemap',
    inputSchema: zodToJsonSchema(GetSitemapSchema),
  },
  {
    name: 'submit_sitemap',
    description: 'Submit a new sitemap to Google Search Console',
    inputSchema: zodToJsonSchema(SubmitSitemapSchema),
  },
  {
    name: 'delete_sitemap',
    description: 'Delete a sitemap from Google Search Console',
    inputSchema: zodToJsonSchema(DeleteSitemapSchema),
  },
  // --- Computed intelligence tools ---
  {
    name: 'compare_periods',
    description:
      'Compare two time periods side-by-side with delta and % change for clicks, impressions, CTR, and position',
    inputSchema: zodToJsonSchema(ComparePeriodsSchema),
  },
  {
    name: 'detect_content_decay',
    description:
      'Find pages losing clicks over time by comparing recent vs earlier performance, sorted by traffic loss',
    inputSchema: zodToJsonSchema(ContentDecaySchema),
  },
  {
    name: 'detect_cannibalization',
    description:
      'Find queries where multiple pages compete for the same keyword, with position variance analysis',
    inputSchema: zodToJsonSchema(CannibalizationSchema),
  },
  {
    name: 'diff_keywords',
    description:
      'Discover new and lost keywords by comparing two time periods',
    inputSchema: zodToJsonSchema(DiffKeywordsSchema),
  },
  {
    name: 'batch_inspect',
    description:
      'Inspect multiple URLs for indexing status (rate-limited to 1/sec, max 100 URLs)',
    inputSchema: zodToJsonSchema(BatchInspectSchema),
  },
  {
    name: 'ctr_analysis',
    description:
      'Analyze CTR vs position benchmarks to find underperforming queries that could benefit from title/description optimization',
    inputSchema: zodToJsonSchema(CtrAnalysisSchema),
  },
  {
    name: 'search_type_breakdown',
    description:
      'Compare performance across search types (web, image, video, discover, news) in a single call',
    inputSchema: zodToJsonSchema(SearchTypeBreakdownSchema),
  },
  // --- Computed intelligence v2 ---
  {
    name: 'page_health_dashboard',
    description:
      'Comprehensive page health check combining URL Inspection (indexing status, canonical), Search Analytics (clicks, impressions, CTR, position), PageSpeed Insights (Lighthouse scores), and CrUX (real-user Core Web Vitals) in a single call. CrUX is optional (requires GOOGLE_CLOUD_API_KEY).',
    inputSchema: zodToJsonSchema(PageHealthDashboardSchema),
  },
  {
    name: 'indexing_health_report',
    description:
      'Batch-check indexing status across site pages. Gets top URLs from search analytics, rate-limited inspects each (1 req/sec), and aggregates: indexed count, not-indexed count, errors, by coverage state. Max 100 URLs per call. Reports quotaUsed for tracking against 2000/day limit.',
    inputSchema: zodToJsonSchema(IndexingHealthReportSchema),
  },
  {
    name: 'serp_feature_tracking',
    description:
      'Track SERP features (rich results, FAQs, videos, AMP, etc.) over time using the searchAppearance dimension. Shows daily trends per feature type.',
    inputSchema: zodToJsonSchema(SerpFeatureTrackingSchema),
  },
  {
    name: 'cannibalization_resolver',
    description:
      'Detect keyword cannibalization AND recommend actions: identifies the winner URL per query and suggests redirect, consolidate, or differentiate for competing pages based on traffic distribution.',
    inputSchema: zodToJsonSchema(CannibalizationResolverSchema),
  },
  {
    name: 'drop_alerts',
    description:
      'Detect pages with significant traffic drops by comparing recent vs previous period. Flags pages exceeding a configurable % threshold (default 50%), sorted by absolute click loss.',
    inputSchema: zodToJsonSchema(DropAlertsSchema),
  },
  // --- Sites CRUD ---
  {
    name: 'get_site',
    description:
      'Get details for a specific site property in Search Console (permission level, URL)',
    inputSchema: zodToJsonSchema(GetSiteSchema),
  },
  {
    name: 'add_site',
    description: 'Add a new site property to Google Search Console',
    inputSchema: zodToJsonSchema(AddSiteSchema),
  },
  {
    name: 'delete_site',
    description: 'Remove a site property from Google Search Console',
    inputSchema: zodToJsonSchema(DeleteSiteSchema),
  },
  // --- Mobile-Friendly Test ---
  {
    name: 'mobile_friendly_test',
    description:
      'Test a URL for mobile-friendliness and get issues with optional screenshot',
    inputSchema: zodToJsonSchema(MobileFriendlyTestSchema),
  },
  // --- PageSpeed Insights ---
  {
    name: 'pagespeed_insights',
    description:
      'Run Google PageSpeed Insights (Lighthouse) analysis on a URL — scores, field data, and diagnostics. No auth required.',
    inputSchema: zodToJsonSchema(PageSpeedInsightsSchema),
  },
  // --- Google Indexing API ---
  {
    name: 'indexing_publish',
    description:
      'Notify Google that a URL has been updated or deleted for faster crawling (Indexing API, 200/day quota). Note: officially limited to JobPosting/BroadcastEvent schema types.',
    inputSchema: zodToJsonSchema(IndexingPublishSchema),
  },
  {
    name: 'indexing_status',
    description:
      'Get Indexing API notification metadata for a URL — shows latest update/remove notifications. URL must have been previously submitted via indexing_publish.',
    inputSchema: zodToJsonSchema(IndexingStatusSchema),
  },
  // --- Chrome UX Report (CrUX) ---
  {
    name: 'crux_query',
    description:
      'Query Chrome UX Report for Core Web Vitals (LCP, CLS, INP, FCP, TTFB) by URL or origin. Requires GOOGLE_CLOUD_API_KEY env var.',
    inputSchema: zodToJsonSchema(CrUXQuerySchema),
  },
  {
    name: 'crux_history',
    description:
      'Query Chrome UX Report 40-week rolling history for Core Web Vitals trends by URL or origin. Requires GOOGLE_CLOUD_API_KEY env var.',
    inputSchema: zodToJsonSchema(CrUXHistorySchema),
  },
];

for (const tool of TOOLS) {
  VALID_TOOL_NAMES.add(tool.name);
}

const MUTATING_TOOLS = new Set([
  'submit_sitemap',
  'delete_sitemap',
  'add_site',
  'delete_site',
  'indexing_publish',
]);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((tool) => ({
    ...tool,
    description: TOOL_EXAMPLES[tool.name]
      ? `${tool.description} Example input: ${JSON.stringify(TOOL_EXAMPLES[tool.name])}`
      : tool.description,
    inputSchema: withResponseModeInputSchema(tool.inputSchema as Record<string, unknown>),
    annotations: {
      readOnlyHint: !MUTATING_TOOLS.has(tool.name),
      ...(TOOL_HINTS[tool.name] ?? DEFAULT_HINTS),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const service = new SearchConsoleService(GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_CLOUD_API_KEY);
  const mode = getResponseMode(args);
  const requestId = randomUUID();
  const cacheEligible = !MUTATING_TOOLS.has(name);
  const cacheKey = cacheEligible ? runtime.buildCacheKey(name, args) : null;
  const idempotencyKey = MUTATING_TOOLS.has(name) ? getIdempotencyKey(args) : null;

  const cacheMetaBase: CacheMeta = {
    cacheHit: false,
    cacheAgeSec: null,
    cacheKey,
  };
  const idempotencyMetaBase: IdempotencyMeta = {
    idempotencyKey,
    idempotencyReplay: false,
  };

  try {
    if (!args && name !== 'list_sites' && name !== 'gsc_healthcheck') {
      return formatToolResult(name, mode, requestId, errorResult({
        error: 'Arguments are required',
      }), {
        ...cacheMetaBase,
        ...idempotencyMetaBase,
      });
    }

    if (cacheEligible && cacheKey) {
      const cached = runtime.getCached(cacheKey);
      if (cached) {
        return formatToolResult(name, mode, requestId, cached.result, {
          cacheHit: true,
          cacheAgeSec: cached.ageSec,
          cacheKey,
          ...idempotencyMetaBase,
        });
      }
    }

    if (idempotencyKey) {
      const replay = runtime.getIdempotentResult(name, idempotencyKey);
      if (replay) {
        return formatToolResult(name, mode, requestId, replay, {
          ...cacheMetaBase,
          idempotencyKey,
          idempotencyReplay: true,
        });
      }
    }

    const quotaUnits = runtime.estimateQuotaUnits(name, args);
    const quotaSnapshot = runtime.reserveQuota(name, quotaUnits);

    const result = await runtime.withConcurrencyLimit(name, async () => {
      switch (name) {
        case 'list_sites':
          return await handleListSites(service);
        case 'gsc_healthcheck': {
          const response = await service.listSites();
          const entries = (response.data?.siteEntry ?? []) as Array<unknown>;
          return jsonResult({
            ok: true,
            auth: 'ok',
            siteCount: entries.length,
            cruxApiKeyConfigured: Boolean(GOOGLE_CLOUD_API_KEY),
            indexingApiConfigured: true,
          });
        }
        case 'search_analytics':
          return await handleSearchAnalytics(service, args);
        case 'search_analytics_cursor':
          return await handleSearchAnalyticsCursor(service, args);
        case 'enhanced_search_analytics':
          return await handleEnhancedSearchAnalytics(service, args);
        case 'detect_quick_wins':
          return await handleDetectQuickWins(service, args);
        case 'recommend_next_actions':
          return await handleRecommendNextActions(service, args);
        case 'index_inspect':
          return await handleIndexInspect(service, args);
        case 'list_sitemaps':
          return await handleListSitemaps(service, args);
        case 'get_sitemap':
          return await handleGetSitemap(service, args);
        case 'submit_sitemap':
          return await handleSubmitSitemap(service, args);
        case 'delete_sitemap':
          return await handleDeleteSitemap(service, args);
        // Computed intelligence tools
        case 'compare_periods':
          return await handleComparePeriods(service, args);
        case 'detect_content_decay':
          return await handleContentDecay(service, args);
        case 'detect_cannibalization':
          return await handleCannibalization(service, args);
        case 'diff_keywords':
          return await handleDiffKeywords(service, args);
        case 'batch_inspect':
          return await handleBatchInspect(service, args);
        case 'ctr_analysis':
          return await handleCtrAnalysis(service, args);
        case 'search_type_breakdown':
          return await handleSearchTypeBreakdown(service, args);
        // Computed intelligence v2
        case 'page_health_dashboard':
          return await handlePageHealthDashboard(service, args);
        case 'indexing_health_report':
          return await handleIndexingHealthReport(service, args);
        case 'serp_feature_tracking':
          return await handleSerpFeatureTracking(service, args);
        case 'cannibalization_resolver':
          return await handleCannibalizationResolver(service, args);
        case 'drop_alerts':
          return await handleDropAlerts(service, args);
        // Sites CRUD
        case 'get_site':
          return await handleGetSite(service, args);
        case 'add_site':
          return await handleAddSite(service, args);
        case 'delete_site':
          return await handleDeleteSite(service, args);
        // Mobile-Friendly Test
        case 'mobile_friendly_test':
          return await handleMobileFriendlyTest(service, args);
        // PageSpeed Insights
        case 'pagespeed_insights':
          return await handlePageSpeedInsights(service, args);
        // Indexing API
        case 'indexing_publish':
          return await handleIndexingPublish(service, args);
        case 'indexing_status':
          return await handleIndexingStatus(service, args);
        // CrUX
        case 'crux_query':
          return await handleCrUXQuery(service, args);
        case 'crux_history':
          return await handleCrUXHistory(service, args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    if (cacheEligible && cacheKey && !result.isError) {
      runtime.setCached(cacheKey, name, result);
    }

    if (idempotencyKey && !result.isError) {
      runtime.saveIdempotentResult(name, idempotencyKey, result);
    }

    return formatToolResult(name, mode, requestId, result, {
      ...cacheMetaBase,
      ...idempotencyMetaBase,
      quota: quotaSnapshot,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return formatToolResult(name, mode, requestId, errorResult({
        error: 'Invalid arguments',
        details: error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      }), {
        ...cacheMetaBase,
        ...idempotencyMetaBase,
      });
    }
    if (error instanceof GSCError) {
      return formatToolResult(name, mode, requestId, errorResult({
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      }), {
        ...cacheMetaBase,
        ...idempotencyMetaBase,
      });
    }
    if (error instanceof Error) {
      const isQuotaBudgetError = error.message.toLowerCase().includes('guardrail');
      return formatToolResult(name, mode, requestId, errorResult({
        error: error.message,
        ...(isQuotaBudgetError
          ? {
              code: 'QUOTA_BUDGET_EXCEEDED',
              statusCode: 429,
            }
          : {}),
      }), {
        ...cacheMetaBase,
        ...idempotencyMetaBase,
      });
    }
    return formatToolResult(name, mode, requestId, errorResult({
      error: 'Unknown error',
      details: String(error),
    }), {
      ...cacheMetaBase,
      ...idempotencyMetaBase,
    });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('mcp-server-gsc-pro running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
