#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
// @ts-ignore — no types shipped
import { zodToJsonSchema } from 'zod-to-json-schema';

import { SearchConsoleService } from './service.js';

// Schemas
import {
  SearchAnalyticsSchema,
  EnhancedSearchAnalyticsSchema,
  QuickWinsSchema,
} from './schemas/analytics.js';
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

// Tool handlers
import {
  handleListSites,
  handleSearchAnalytics,
  handleEnhancedSearchAnalytics,
  handleDetectQuickWins,
} from './tools/analytics.js';
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
  { name: 'mcp-server-gsc-pro', version: '1.1.0' },
  { capabilities: { tools: {} } },
);

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'list_sites',
    description: 'List all sites available in Google Search Console',
    inputSchema: zodToJsonSchema(z.object({})),
  },
  {
    name: 'search_analytics',
    description:
      'Query search performance data (clicks, impressions, CTR, position) with filtering by page, query, country, device, and search type',
    inputSchema: zodToJsonSchema(SearchAnalyticsSchema),
  },
  {
    name: 'enhanced_search_analytics',
    description:
      'Advanced search analytics with regex filters, up to 25K rows, and optional quick-wins detection',
    inputSchema: zodToJsonSchema(EnhancedSearchAnalyticsSchema),
  },
  {
    name: 'detect_quick_wins',
    description:
      'Find SEO quick-win opportunities: high-impression, low-CTR queries in striking distance (positions 4-10)',
    inputSchema: zodToJsonSchema(QuickWinsSchema),
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
] as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [...TOOLS],
}));

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args && name !== 'list_sites') {
    throw new Error('Arguments are required');
  }

  const service = new SearchConsoleService(GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_CLOUD_API_KEY);

  try {
    switch (name) {
      case 'list_sites':
        return await handleListSites(service);
      case 'search_analytics':
        return await handleSearchAnalytics(service, args);
      case 'enhanced_search_analytics':
        return await handleEnhancedSearchAnalytics(service, args);
      case 'detect_quick_wins':
        return await handleDetectQuickWins(service, args);
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments: ${error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ')}`,
      );
    }
    throw error;
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
