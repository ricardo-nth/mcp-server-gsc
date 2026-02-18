# mcp-server-gsc-pro

Enhanced MCP server for Google Search Console. 31 tools spanning raw API access, computed intelligence, and adjacent Google APIs — designed for AI agents that do SEO work.

## Who this is for

Teams and individuals using AI coding agents (Claude Code, Cursor, etc.) for SEO. If you manage websites and want your AI assistant to query Search Console data, diagnose indexing issues, track performance trends, and surface actionable insights — without writing API code — this is the tool.

## What it does

Wraps the full Google Search Console API surface into MCP tools, then adds a layer of computed intelligence that combines multiple API calls into higher-level insights. Also integrates PageSpeed Insights, Google Indexing API, Chrome UX Report (CrUX), and mobile-friendly testing.

**Raw API access** — search analytics with filtering, URL inspection, sitemaps CRUD, sites CRUD.

**Computed intelligence** — period comparison with delta tracking, content decay detection, keyword cannibalization analysis, CTR benchmarking, keyword diff, batch inspection, SERP feature tracking, automated drop alerts, and page-level health dashboards that pull from 4 APIs in a single call.

**Reliability** — auto-retry with exponential backoff, structured error types with fix instructions, input validation on all fields, auto-pagination for large result sets, and partial-failure tolerance on multi-API tools.

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

The `crux_query` and `crux_history` tools require a Google Cloud API key. All other 29 tools work without it.

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

## Tools (31)

### Core (9 tools)

| Tool | Description |
|------|-------------|
| `list_sites` | List all GSC properties accessible to the service account |
| `search_analytics` | Query clicks/impressions/CTR/position with filtering by page, query, country, device, search type |
| `enhanced_search_analytics` | Same + regex filters, quick-wins detection, auto-pagination up to 100K rows |
| `detect_quick_wins` | Find high-impression, low-CTR queries in striking distance (positions 4-10) |
| `index_inspect` | Check indexing status, crawl info, mobile usability, rich results for a URL |
| `list_sitemaps` | List submitted sitemaps |
| `get_sitemap` | Get details of a specific sitemap |
| `submit_sitemap` | Submit a new sitemap |
| `delete_sitemap` | Remove a sitemap |

### Computed Intelligence (7 tools)

Single-API tools that combine multiple queries into structured analysis.

| Tool | Description |
|------|-------------|
| `compare_periods` | Two-period side-by-side comparison with delta and % change for all metrics |
| `detect_content_decay` | Pages losing clicks over time, sorted by traffic loss |
| `detect_cannibalization` | Queries where multiple pages compete, with position variance analysis |
| `diff_keywords` | New and lost keywords between two time periods |
| `batch_inspect` | Inspect up to 100 URLs for indexing status (rate-limited 1/sec) |
| `ctr_analysis` | CTR vs position benchmarks to find underperforming queries |
| `search_type_breakdown` | Compare performance across web/image/video/discover/news |

### Multi-API Intelligence (5 tools)

Tools that combine data from multiple Google APIs in a single call, using `Promise.allSettled` for partial-failure tolerance.

| Tool | Description |
|------|-------------|
| `page_health_dashboard` | Unified page report: URL inspection + search analytics + PageSpeed Insights + CrUX |
| `indexing_health_report` | Batch indexing status for top pages with coverage aggregation and quota tracking |
| `serp_feature_tracking` | Monitor search appearance trends (rich results, FAQ, etc.) over time |
| `cannibalization_resolver` | Detect keyword cannibalization + recommend redirect/consolidate/differentiate |
| `drop_alerts` | Automated traffic/position drop detection with configurable thresholds |

### Adjacent APIs (10 tools)

Direct access to related Google APIs.

| Tool | Description |
|------|-------------|
| `get_site` | Get site property details (permission level, URL) |
| `add_site` | Add a new site property |
| `delete_site` | Remove a site property |
| `mobile_friendly_test` | Test a URL for mobile-friendliness with optional screenshot |
| `pagespeed_insights` | Lighthouse scores + CrUX field data (no auth required) |
| `indexing_publish` | Notify Google of URL updates/deletions (200/day quota) |
| `indexing_status` | Get Indexing API notification metadata for a URL |
| `crux_query` | Core Web Vitals (LCP, CLS, INP, FCP, TTFB) by URL or origin |
| `crux_history` | 40-week rolling CWV history by URL or origin |

## Common Parameters

**Flexible dates** — all date-based tools accept either:
- `startDate` + `endDate` (YYYY-MM-DD, validated)
- `days` (relative window ending yesterday, accounting for GSC data lag)

**Data freshness** — set `dataState: "all"` on analytics tools for data within hours instead of the default 2-3 day lag.

**Search types** — `web`, `image`, `video`, `news`, `discover`, `googleNews`.

**Auto-pagination** — `enhanced_search_analytics` and `detect_quick_wins` accept `maxRows` (up to 100,000) to fetch beyond the 25K per-request API limit.

**Error handling** — all errors return structured MCP payloads with `isError: true`, specific error codes (`AUTH_ERROR`, `QUOTA_ERROR`, `PERMISSION_ERROR`), and actionable messages.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | Path to service account JSON key file |
| `GOOGLE_CLOUD_API_KEY` | No | Google Cloud API key for CrUX tools only |

## Development

```bash
pnpm install
pnpm build      # TypeScript compile to dist/
pnpm test       # Vitest (119 tests)
pnpm lint       # Type check only (tsc --noEmit)
```

CI runs on every PR: lint + test + build across Node 18, 20, 22.

## License

MIT
