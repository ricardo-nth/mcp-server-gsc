# mcp-server-gsc-pro

Enhanced MCP server for Google Search Console. All original functionality from [mcp-server-gsc](https://github.com/ahonn/mcp-server-gsc) plus fresh data access, computed intelligence tools, and flexible date handling.

## What's different

- **16 tools** (vs 8 original) — adds period comparison, content decay detection, keyword cannibalization, CTR analysis, keyword diffing, batch URL inspection, search type breakdown
- **Fresh data** — `dataState: "all"` for data within hours, not days
- **More search types** — `discover`, `googleNews` alongside web/image/video/news
- **Auto-retry** — exponential backoff with jitter on 429/5xx
- **Flexible dates** — use `days: 28` instead of calculating start/end dates
- **Actionable errors** — `GSCAuthError`, `GSCQuotaError`, `GSCPermissionError` with fix instructions
- **Auto-pagination** utility for >25K row queries

## Setup

### 1. Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select a project, enable the **Search Console API**
3. Create a service account → download the JSON key
4. In [Search Console](https://search.google.com/search-console/), add the service account email as a user for each property

### 2. Install

```bash
npm install -g mcp-server-gsc-pro
```

### 3. Configure MCP

Add to your `.mcp.json` or Claude Desktop config:

```json
{
  "mcpServers": {
    "gsc": {
      "command": "mcp-server-gsc-pro",
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account-key.json"
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
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account-key.json"
      }
    }
  }
}
```

## Tools

### Core

| Tool | Description |
|------|-------------|
| `list_sites` | List all GSC properties accessible to the service account |
| `search_analytics` | Query clicks/impressions/CTR/position with filters |
| `enhanced_search_analytics` | Same + regex filters, quick-wins detection |
| `detect_quick_wins` | Find high-impression, low-CTR queries in striking distance |
| `index_inspect` | Check indexing status, crawl info, rich results for a URL |
| `list_sitemaps` | List submitted sitemaps |
| `get_sitemap` | Get details of a specific sitemap |
| `submit_sitemap` | Submit a new sitemap |
| `delete_sitemap` | Remove a sitemap |

### Computed Intelligence

| Tool | Description |
|------|-------------|
| `compare_periods` | Two-period side-by-side with delta + % change |
| `detect_content_decay` | Pages losing clicks over time, sorted by loss |
| `detect_cannibalization` | Queries with multiple competing pages |
| `diff_keywords` | New and lost keywords between periods |
| `batch_inspect` | Inspect up to 100 URLs (rate-limited 1/sec) |
| `ctr_analysis` | CTR vs position benchmarks, find underperformers |
| `search_type_breakdown` | Compare web/image/video/discover/news |

### Common Parameters

**Flexible dates** — all date-based tools accept either explicit dates or relative days:
- `startDate` + `endDate` (YYYY-MM-DD)
- `days` (relative, ending yesterday)

**Data freshness** — set `dataState: "all"` on analytics tools for fresh (hours-old) data.

**Search types** — `web`, `image`, `video`, `news`, `discover`, `googleNews`.

## Development

```bash
pnpm install
pnpm build      # TypeScript compile
pnpm test       # Run vitest
pnpm lint       # Type check only
```

## License

MIT
