# mcp-server-gsc-pro

Enhanced MCP server for Google Search Console. Tooling spans raw API access, computed intelligence, operations diagnostics, and adjacent Google APIs — designed for AI agents that do SEO work.

## Who this is for

Teams and individuals using AI coding agents (Claude Code, Cursor, etc.) for SEO. If you manage websites and want your AI assistant to query Search Console data, diagnose indexing issues, track performance trends, and surface actionable insights — without writing API code — this is the tool.

## What it does

Wraps the full Google Search Console API surface into MCP tools, then adds a layer of computed intelligence that combines multiple API calls into higher-level insights. Also integrates PageSpeed Insights, Google Indexing API, Chrome UX Report (CrUX), and mobile-friendly testing.

**Raw API access** — search analytics with filtering, URL inspection, sitemaps CRUD, sites CRUD.

**Computed intelligence** — period comparison with delta tracking, content decay detection, keyword cannibalization analysis, CTR benchmarking, keyword diff, batch inspection, SERP feature tracking, automated drop alerts with seasonal suppression and change-point flags, and page-level health dashboards that pull from 4 APIs in a single call.

**Reliability** — auto-retry with exponential backoff, structured error types with fix instructions, input validation on all fields, auto-pagination for large result sets, partial-failure tolerance on multi-API tools, and optional persisted quota/idempotency state across restarts.

## What it doesn't do

- No web scraping or crawling — this is API data only
- No content generation or optimization suggestions — it surfaces data, the AI agent interprets it
- No Google Ads or GA4 integration
- Indexing API notifications are officially limited to JobPosting/BroadcastEvent schema types

## Setup

### 1. Google Service Account (required)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the **Search Console API** and **Indexing API** under [APIs & Services > Library](https://console.cloud.google.com/apis/library)
4. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials) and create a **Service Account**
5. Create a key for the service account (JSON format) and download it
6. In [Google Search Console](https://search.google.com/search-console/), add the service account email as a user for each property you want to access

### 2. Google Cloud API Key (optional — for CrUX tools)

The `crux_query` and `crux_history` tools require a Google Cloud API key. All other tools work without it.

1. In the same Google Cloud project, enable the **Chrome UX Report API** — search for it in [APIs & Services > Library](https://console.cloud.google.com/apis/library) or go directly to the [Marketplace listing](https://console.cloud.google.com/marketplace/product/google/chromeuxreport.googleapis.com)
2. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials) and click **Create Credentials > API key**
3. Click the key name to edit it, then under **API restrictions** select **Restrict key** and choose only **Chrome UX Report API** — this limits exposure if the key leaks
4. Leave **Application restrictions** as **None** (the key is used server-side by Node.js, not from a browser)
5. Copy the key

The CrUX API is free with a 150 queries/minute limit. No billing required. Note that CrUX only has data for sites with sufficient traffic (roughly a few thousand monthly visits) — low-traffic sites will return empty results.

### 3. Install

```bash
npm install -g mcp-server-gsc-pro
```

### 4. Configure MCP

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "gsc": {
      "command": "npx",
      "args": ["-y", "mcp-server-gsc-pro"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account-key.json",
        "GOOGLE_CLOUD_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Or run from source:

```json
{
  "mcpServers": {
    "gsc": {
      "command": "node",
      "args": ["/path/to/mcp-server-gsc-pro/dist/index.js"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account-key.json",
        "GOOGLE_CLOUD_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Setting credentials globally** — if you use the same service account and API key across multiple projects, you can export them in your shell config (e.g. `~/.zshrc` or `~/.bashrc`) instead of repeating them in every `.mcp.json`:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
export GOOGLE_CLOUD_API_KEY="your-api-key-here"
```

With global exports, your `.mcp.json` simplifies to:

```json
{
  "mcpServers": {
    "gsc": {
      "command": "npx",
      "args": ["-y", "mcp-server-gsc-pro"]
    }
  }
}
```

> The `env` block in `.mcp.json` takes precedence over shell environment variables, so you can still override per-project if needed.

<!-- GENERATED:tools:start -->

## Tools (35)

### Core (13 tools)

| Tool | Description |
|------|-------------|
| `list_sites` | List all sites available in Google Search Console |
| `gsc_healthcheck` | Quick preflight check for agent workflows: validates Search Console auth by listing sites and reports optional API key availability. |
| `search_analytics` | Query search performance data (clicks, impressions, CTR, position) with filtering by page, query, country, device, and search type |
| `search_analytics_cursor` | Cursor-based retrieval for large analytics datasets. Returns one page of rows and a nextCursor token for incremental fetches up to 100K rows. |
| `enhanced_search_analytics` | Advanced search analytics with regex filters, optional auto-pagination up to 100K rows, and optional quick-wins detection |
| `detect_quick_wins` | Find SEO quick-win opportunities: high-impression, low-CTR queries in striking distance (positions 4-10), with optional auto-pagination up to 100K rows |
| `recommend_next_actions` | Generate deterministic ranked SEO actions by combining click upside, impression volume, rank distance, indexing health, CWV quality, branded segmentation, and page template grouping. |
| `run_seo_audit_workflow` | Run a profile-based SEO audit orchestrator (technical, content, indexing) and return executive summary, issues/actions with ownership metadata, a shared report contract, and optional markdown and/or branded HTML report output, including client-ready monthly SEO sections when reportPack is "monthly_seo". |
| `index_inspect` | Inspect a URL for indexing status, crawl info, mobile usability, and rich results |
| `list_sitemaps` | List all sitemaps submitted for a site |
| `get_sitemap` | Get details of a specific sitemap |
| `submit_sitemap` | Submit a new sitemap to Google Search Console |
| `delete_sitemap` | Delete a sitemap from Google Search Console |

### Operations (1 tool)

| Tool | Description |
|------|-------------|
| `health_snapshot` | Runtime diagnostics snapshot for operations: cache/idempotency state, concurrency queues, quota guardrails, provider registry status, and per-tool success/failure counters. |

### Computed Intelligence (7 tools)

Single-API tools that combine multiple queries into structured analysis.

| Tool | Description |
|------|-------------|
| `compare_periods` | Compare two time periods side-by-side with delta and % change for clicks, impressions, CTR, and position |
| `detect_content_decay` | Find pages losing clicks over time by comparing recent vs earlier performance, sorted by traffic loss |
| `detect_cannibalization` | Find queries where multiple pages compete for the same keyword, with position variance analysis |
| `diff_keywords` | Discover new and lost keywords by comparing two time periods |
| `batch_inspect` | Inspect multiple URLs for indexing status (rate-limited to 1/sec, max 100 URLs) |
| `ctr_analysis` | Analyze CTR vs position benchmarks to find underperforming queries that could benefit from title/description optimization |
| `search_type_breakdown` | Compare performance across search types (web, image, video, discover, news) in a single call |

### Multi-API Intelligence (5 tools)

Tools that combine data from multiple Google APIs in a single call, using `Promise.allSettled` for partial-failure tolerance.

| Tool | Description |
|------|-------------|
| `page_health_dashboard` | Comprehensive page health check combining URL Inspection (indexing status, canonical), Search Analytics (clicks, impressions, CTR, position), PageSpeed Insights (Lighthouse scores), and CrUX (real-user Core Web Vitals) in a single call. CrUX is optional (requires GOOGLE_CLOUD_API_KEY). |
| `indexing_health_report` | Batch-check indexing status across site pages. Gets top URLs from search analytics, rate-limited inspects each (1 req/sec), and aggregates: indexed count, not-indexed count, errors, by coverage state. Max 100 URLs per call. Reports quotaUsed for tracking against 2000/day limit. |
| `serp_feature_tracking` | Track SERP features (rich results, FAQs, videos, AMP, etc.) over time using the searchAppearance dimension. Shows daily trends per feature type. |
| `cannibalization_resolver` | Detect keyword cannibalization AND recommend actions: identifies the winner URL per query and adds intent, brand/template context, severity, and stronger redirect/consolidate/differentiate guidance. |
| `drop_alerts` | Detect pages with significant traffic drops by comparing recent vs previous period. Flags pages exceeding a configurable % threshold (default 50%), sorted by absolute click loss. |

### Adjacent APIs (9 tools)

Direct access to related Google APIs.

| Tool | Description |
|------|-------------|
| `get_site` | Get details for a specific site property in Search Console (permission level, URL) |
| `add_site` | Add a new site property to Google Search Console |
| `delete_site` | Remove a site property from Google Search Console |
| `mobile_friendly_test` | Test a URL for mobile-friendliness and get issues with optional screenshot |
| `pagespeed_insights` | Run Google PageSpeed Insights (Lighthouse) analysis on a URL — scores, field data, and diagnostics. No auth required. |
| `indexing_publish` | Notify Google that a URL has been updated or deleted for faster crawling (Indexing API, 200/day quota). Note: officially limited to JobPosting/BroadcastEvent schema types. |
| `indexing_status` | Get Indexing API notification metadata for a URL — shows latest update/remove notifications. URL must have been previously submitted via indexing_publish. |
| `crux_query` | Query Chrome UX Report for Core Web Vitals (LCP, CLS, INP, FCP, TTFB) by URL or origin. Requires GOOGLE_CLOUD_API_KEY env var. |
| `crux_history` | Query Chrome UX Report 40-week rolling history for Core Web Vitals trends by URL or origin. Requires GOOGLE_CLOUD_API_KEY env var. |

### Example Inputs

Generated from the runtime tool registry.

#### `health_snapshot`

```json
{
  "includeToolMetrics": true
}
```

#### `search_analytics`

```json
{
  "siteUrl": "sc-domain:example.com",
  "days": 28,
  "dimensions": [
    "query",
    "page"
  ],
  "rowLimit": 1000,
  "mode": "compact"
}
```

#### `search_analytics_cursor`

```json
{
  "siteUrl": "sc-domain:example.com",
  "days": 28,
  "dimensions": [
    "query",
    "page"
  ],
  "pageSize": 5000,
  "maxRows": 100000,
  "mode": "compact"
}
```

#### `enhanced_search_analytics`

```json
{
  "siteUrl": "sc-domain:example.com",
  "days": 28,
  "regexFilter": "brand|pricing",
  "maxRows": 50000,
  "mode": "compact"
}
```

#### `recommend_next_actions`

```json
{
  "siteUrl": "sc-domain:example.com",
  "days": 28,
  "topActions": 5,
  "minImpressions": 100,
  "brandTerms": [
    "example"
  ],
  "includeCwv": true
}
```

#### `run_seo_audit_workflow`

```json
{
  "siteUrl": "sc-domain:example.com",
  "days": 28,
  "profile": "content",
  "reportFormat": "all",
  "detailMode": "both",
  "reportPack": "monthly_seo",
  "brand": {
    "name": "Nth Agency",
    "accentColor": "#0F172A"
  }
}
```

#### `index_inspect`

```json
{
  "siteUrl": "sc-domain:example.com",
  "url": "https://example.com/pricing",
  "mode": "full"
}
```

#### `compare_periods`

```json
{
  "siteUrl": "sc-domain:example.com",
  "days": 14,
  "dimensions": [
    "query"
  ],
  "rowLimit": 500
}
```

#### `page_health_dashboard`

```json
{
  "siteUrl": "sc-domain:example.com",
  "url": "https://example.com/blog/post",
  "days": 28
}
```

#### `indexing_health_report`

```json
{
  "siteUrl": "sc-domain:example.com",
  "source": "manual",
  "urls": [
    "https://example.com/",
    "https://example.com/pricing"
  ],
  "mode": "compact"
}
```

<!-- GENERATED:tools:end -->

## Common Parameters

**Flexible dates** — all date-based tools accept either:
- `startDate` + `endDate` (YYYY-MM-DD, validated)
- `days` (relative window ending yesterday, accounting for GSC data lag)

**Data freshness** — set `dataState: "all"` on analytics tools for data within hours instead of the default 2-3 day lag.

**Search types** — `web`, `image`, `video`, `news`, `discover`, `googleNews`.

**Auto-pagination** — `enhanced_search_analytics` and `detect_quick_wins` accept `maxRows` (up to 100,000) to fetch beyond the 25K per-request API limit.

**Cursor retrieval** — `search_analytics_cursor` returns one page plus `pageInfo.nextCursor` so agents can stream large result sets in deterministic chunks instead of one giant payload.

**Intent-aware analysis** — `detect_quick_wins` and `detect_cannibalization` support `intentAware: true` to attach deterministic intent labels and query clusters. `recommend_next_actions` now also returns branded vs non-branded segmentation and page template grouping, with optional `brandTerms` input that extends derived hostname terms. `cannibalization_resolver` adds the same brand-term extension path plus stronger severity, owner, and action-priority guidance.

**Workflow orchestration** — `run_seo_audit_workflow` runs profile-driven multi-step audits (`technical`, `content`, `indexing`) with partial-failure step statuses, executive summary, drilldown sections, deterministic `issues` / `actions` handoff data, a shared `report` payload, and optional `markdownReport` / `htmlReport` outputs. Use `reportFormat`, `reportPack`, `detailMode`, and optional `brand` metadata to shape report-oriented outputs. The `monthly_seo` pack now renders a client-facing performance report with month-over-month KPI summaries, visibility wins, popular searches, top pages, brand vs non-brand performance, next-month priorities, and an analyst appendix. Report packs are validated against compatible profiles: `technical_audit` -> `technical`, `indexing_recovery` -> `indexing`, `monthly_seo` / `content_opportunities` -> `content`. If `profile` is omitted, the workflow still defaults to `technical`.

**Response mode** — every tool accepts `mode: "full" | "compact"` (default `full`). Use `compact` when you want smaller payloads for large arrays (lower token usage in agent loops).

**Standard response envelope** — every response (success and error) includes:
- `schemaVersion`
- `requestId`
- `mode`
- `summary.whatChanged`
- `summary.whyItMatters`
- `summary.suggestedNextTool` (when a deterministic next step is known)

The original payload fields are preserved at top-level for backward compatibility (for example, `rows`, `comparisons`, `features`, `error`, etc.).

**Tool planning hints** — `ListTools` now includes richer annotations (read-only flag plus cost/latency/quota hints), and selected high-usage tools include inline input examples in their descriptions.

**Runtime reliability controls** — Phase 2 adds global/per-tool concurrency limiting, quota-budget guardrails (fail-fast before quota burn), idempotency support for mutating retries (currently `indexing_publish` via `idempotencyKey`), and optional persisted quota/idempotency state across restarts.

**Observability controls** — telemetry emits one structured event per tool call (tool name, latency, retries, quota estimate, cache/idempotency flags). Enable `GSC_DEBUG_MODE=true` for redacted request/response traces, and use `health_snapshot` for runtime diagnostics including persistence state.

**Error handling** — all errors return structured MCP payloads with `isError: true`, specific error codes (`AUTH_ERROR`, `QUOTA_ERROR`, `PERMISSION_ERROR`), and actionable messages.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | Path to service account JSON key file |
| `GOOGLE_CLOUD_API_KEY` | No | Google Cloud API key for CrUX tools only |
| `GSC_CACHE_TTL_SEC` | No | Default response cache TTL in seconds (default: `120`) |
| `GSC_GLOBAL_CONCURRENCY` | No | Max concurrent in-flight tool executions across the server (default: `8`) |
| `GSC_QUOTA_BUDGET_GLOBAL_DAILY` | No | Daily global guardrail budget for quota-sensitive tools (default: `5000`) |
| `GSC_IDEMPOTENCY_TTL_SEC` | No | TTL for idempotency replay records (default: `86400`) |
| `GSC_RUNTIME_STATE_PATH` | No | Override path for persisted quota/idempotency state (default: `~/.mcp-server-gsc-pro/runtime-state.json`; set empty to disable) |
| `GSC_TELEMETRY_ENABLED` | No | Emit structured telemetry events to stderr for every tool call (default: `true`) |
| `GSC_DEBUG_MODE` | No | Include redacted request/response traces in response metadata (default: `false`) |

## Development

```bash
pnpm install
pnpm build      # TypeScript compile to dist/
pnpm test       # Vitest suite
pnpm lint       # Type check only (tsc --noEmit)
```

CI runs on every PR across Node 18, 20, and 22: lint, test, build, docs drift check, release metadata check, MCP smoke test, and `npm pack --dry-run`.

Operational runbook: see `docs/operations.md` for telemetry fields, redaction behavior, and health snapshot usage.

Release/process docs: `CHANGELOG.md`, `docs/releasing.md`, and migration notes in `docs/migrations/`.

## License

MIT
