#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { GSCError, SearchConsoleService } from './service.js';
import {
  DEFAULT_TOOL_HINTS,
  MUTATING_TOOLS,
  NON_CACHEABLE_TOOLS,
  TOOL_NAME_SET,
  TOOL_REGISTRY,
} from './tool-registry.js';
import {
  errorResult,
  jsonResult,
  toEnvelopedResult,
  type ResponseMode,
  type ResponseSummary,
  type ToolResult,
} from './utils/types.js';

// Tool handlers
import {
  handleListSites,
  handleSearchAnalytics,
  handleEnhancedSearchAnalytics,
  handleDetectQuickWins,
  handleSearchAnalyticsCursor,
} from './tools/analytics.js';
import { handleRecommendNextActions } from './tools/recommendations.js';
import { handleRunSeoAuditWorkflow } from './tools/workflow.js';
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
  type QuotaSnapshot,
} from './utils/runtime.js';
import { withRetryTraceContext } from './utils/retry.js';
import { redactSensitiveData } from './utils/redaction.js';
import { ConsoleTelemetrySink, TelemetryRecorder } from './utils/telemetry.js';
import { handleHealthSnapshot } from './tools/operations.js';
import { normalizeQuotaTrackedArgs } from './utils/quota.js';
import { createDefaultSeoProviders, createSeoProviderRegistry } from './providers/index.js';

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

function envFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

const TELEMETRY_ENABLED = envFlag('GSC_TELEMETRY_ENABLED', true);
const DEBUG_MODE = envFlag('GSC_DEBUG_MODE', false);

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'mcp-server-gsc-pro', version: '1.2.3' },
  { capabilities: { tools: {} } },
);

const RESPONSE_SCHEMA_VERSION = '1.0.0';
const runtime = new RuntimeCoordinator();
const telemetry = new TelemetryRecorder(new ConsoleTelemetrySink(), TELEMETRY_ENABLED);
const providerRegistry = createSeoProviderRegistry(createDefaultSeoProviders());

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ReturnType<typeof zodToJsonSchema>;
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

const VALID_TOOL_NAMES = TOOL_NAME_SET;

const SUGGESTED_NEXT_TOOL: Record<string, string> = {
  list_sites: 'search_analytics',
  gsc_healthcheck: 'list_sites',
  search_analytics: 'detect_quick_wins',
  search_analytics_cursor: 'enhanced_search_analytics',
  enhanced_search_analytics: 'detect_quick_wins',
  recommend_next_actions: 'page_health_dashboard',
  run_seo_audit_workflow: 'recommend_next_actions',
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
  health_snapshot: 'gsc_healthcheck',
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

function getResultPayload(result: ToolResult): Record<string, unknown> {
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent as Record<string, unknown>;
  }
  return {};
}

function getErrorTelemetryFields(result: ToolResult): {
  errorCode?: string;
  errorMessage?: string;
} {
  if (!result.isError) {
    return {};
  }

  const payload = getResultPayload(result);
  const errorCode = typeof payload.code === 'string' ? payload.code : undefined;
  const errorMessage = typeof payload.error === 'string' ? payload.error : undefined;

  return {
    ...(errorCode ? { errorCode } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOL_EXAMPLES = Object.fromEntries(
  TOOL_REGISTRY.filter((tool) => tool.example).map((tool) => [tool.name, tool.example]),
);

const TOOL_HINTS = Object.fromEntries(
  TOOL_REGISTRY.filter((tool) => tool.hints).map((tool) => [tool.name, tool.hints]),
);

const TOOLS: ToolDefinition[] = TOOL_REGISTRY.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: zodToJsonSchema(tool.schema),
}));

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((tool) => ({
    ...tool,
    description: TOOL_EXAMPLES[tool.name]
      ? `${tool.description} Example input: ${JSON.stringify(TOOL_EXAMPLES[tool.name])}`
      : tool.description,
    inputSchema: withResponseModeInputSchema(tool.inputSchema as Record<string, unknown>),
    annotations: {
      readOnlyHint: !MUTATING_TOOLS.has(tool.name),
      ...(TOOL_HINTS[tool.name] ?? DEFAULT_TOOL_HINTS),
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
  const startTimeMs = Date.now();
  const cacheEligible = !MUTATING_TOOLS.has(name) && !NON_CACHEABLE_TOOLS.has(name);
  const cacheKey = cacheEligible ? runtime.buildCacheKey(name, args) : null;
  const idempotencyKey = MUTATING_TOOLS.has(name) ? getIdempotencyKey(args) : null;
  let retries = 0;
  let quotaUnitsEstimated = 0;
  let quotaSnapshot: QuotaSnapshot | undefined;

  const cacheMetaBase: CacheMeta = {
    cacheHit: false,
    cacheAgeSec: null,
    cacheKey,
  };
  const idempotencyMetaBase: IdempotencyMeta = {
    idempotencyKey,
    idempotencyReplay: false,
  };

  const finalizeResult = (
    result: ToolResult,
    metadata: Record<string, unknown>,
    state: {
      cacheHit: boolean;
      idempotencyReplay: boolean;
    },
  ): ToolResult => {
    const responseMetadata: Record<string, unknown> = {
      ...metadata,
      retries,
      quotaUnitsEstimated,
      ...(quotaSnapshot ? { quota: quotaSnapshot } : {}),
    };

    if (DEBUG_MODE) {
      responseMetadata.debugTrace = {
        request: {
          toolName: name,
          args: redactSensitiveData(args ?? {}),
        },
        response: {
          isError: Boolean(result.isError),
          payload: redactSensitiveData(getResultPayload(result)),
        },
      };
    }

    const formatted = formatToolResult(name, mode, requestId, result, responseMetadata);
    const status = formatted.isError ? 'error' : 'success';
    const latencyMs = Date.now() - startTimeMs;

    runtime.recordToolExecution(name, status === 'success' ? 'success' : 'failure', latencyMs);
    telemetry.track({
      timestamp: new Date().toISOString(),
      requestId,
      toolName: name,
      mode,
      status,
      latencyMs,
      retries,
      quotaUnitsEstimated,
      quotaUnitsReserved: quotaSnapshot?.toolUnitsReserved ?? 0,
      cacheHit: state.cacheHit,
      idempotencyReplay: state.idempotencyReplay,
      ...getErrorTelemetryFields(result),
    });

    return formatted;
  };

  try {
    if (!args && !['list_sites', 'gsc_healthcheck', 'health_snapshot'].includes(name)) {
      return finalizeResult(errorResult({
        error: 'Arguments are required',
      }), {
        ...cacheMetaBase,
        ...idempotencyMetaBase,
      }, {
        cacheHit: false,
        idempotencyReplay: false,
      });
    }

    if (cacheEligible && cacheKey) {
      const cached = runtime.getCached(cacheKey);
      if (cached) {
        return finalizeResult(cached.result, {
          cacheHit: true,
          cacheAgeSec: cached.ageSec,
          cacheKey,
          ...idempotencyMetaBase,
        }, {
          cacheHit: true,
          idempotencyReplay: false,
        });
      }
    }

    if (idempotencyKey) {
      const replay = runtime.getIdempotentResult(name, idempotencyKey);
      if (replay) {
        return finalizeResult(replay, {
          ...cacheMetaBase,
          idempotencyKey,
          idempotencyReplay: true,
        }, {
          cacheHit: false,
          idempotencyReplay: true,
        });
      }
    }

    const quotaArgs = normalizeQuotaTrackedArgs(name, args);
    quotaUnitsEstimated = runtime.estimateQuotaUnits(name, quotaArgs);
    quotaSnapshot = runtime.reserveQuota(name, quotaUnitsEstimated);

    const traced = await withRetryTraceContext(async () =>
      runtime.withConcurrencyLimit(name, async () => {
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
          case 'health_snapshot':
            return await handleHealthSnapshot(runtime, providerRegistry, args, {
              debugMode: DEBUG_MODE,
              telemetryEnabled: telemetry.isEnabled(),
            });
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
          case 'run_seo_audit_workflow':
            return await handleRunSeoAuditWorkflow(service, args);
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
      }),
    );
    retries = traced.retries;
    const result = traced.result;

    if (cacheEligible && cacheKey && !result.isError) {
      runtime.setCached(cacheKey, name, result);
    }

    if (idempotencyKey && !result.isError) {
      runtime.saveIdempotentResult(name, idempotencyKey, result);
    }

    return finalizeResult(result, {
      ...cacheMetaBase,
      ...idempotencyMetaBase,
    }, {
      cacheHit: false,
      idempotencyReplay: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return finalizeResult(errorResult({
        error: 'Invalid arguments',
        details: error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      }), {
        ...cacheMetaBase,
        ...idempotencyMetaBase,
      }, {
        cacheHit: false,
        idempotencyReplay: false,
      });
    }
    if (error instanceof GSCError) {
      return finalizeResult(errorResult({
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      }), {
        ...cacheMetaBase,
        ...idempotencyMetaBase,
      }, {
        cacheHit: false,
        idempotencyReplay: false,
      });
    }
    if (error instanceof Error) {
      const isQuotaBudgetError = error.message.toLowerCase().includes('guardrail');
      return finalizeResult(errorResult({
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
      }, {
        cacheHit: false,
        idempotencyReplay: false,
      });
    }
    return finalizeResult(errorResult({
      error: 'Unknown error',
      details: String(error),
    }), {
      ...cacheMetaBase,
      ...idempotencyMetaBase,
    }, {
      cacheHit: false,
      idempotencyReplay: false,
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
