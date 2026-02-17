# mcp-server-gsc-pro

## Stack
- TypeScript 5.7+, ESM, Node 18+
- MCP SDK (`@modelcontextprotocol/sdk`)
- Google APIs (`googleapis`, `google-auth-library`)
- Zod for schema validation
- Vitest for tests

## Architecture
```
src/
  index.ts          ← MCP server entry, tool registration + dispatch
  service.ts        ← SearchConsoleService (auth, all Google API calls, retry, error classification)
  schemas/          ← Zod schemas per tool group (base, analytics, inspection, sitemaps, computed, sites, mobilefriendly, pagespeed, indexing, crux)
  tools/            ← Tool handler functions per group (analytics, inspection, sitemaps, computed, sites, mobilefriendly, pagespeed, indexing, crux)
  utils/            ← Shared utilities (types, dates, pagination, retry)
tests/              ← Vitest test suites
```

## Key Patterns
- All tools return `ToolResult` (has `[key: string]: unknown` index signature for MCP SDK compat)
- `jsonResult()` / `errorResult()` helpers in `utils/types.ts`
- `resolveDateRange()` in `utils/dates.ts` — all date-based tools accept `days` OR `startDate`/`endDate`
- Service methods wrapped in `withRetry()` + `withPermissionFallback()`
- Custom error types: `GSCAuthError`, `GSCQuotaError`, `GSCPermissionError`

## Commands
- `pnpm build` — TypeScript compile to dist/
- `pnpm test` — Vitest
- `pnpm lint` — Type check only (no emit)

## Environment
- `GOOGLE_APPLICATION_CREDENTIALS` — path to service account JSON key (required)
- `GOOGLE_CLOUD_API_KEY` — Google Cloud API key for CrUX tools (optional)

## Roadmap
See `.changelog.jsonl` upcoming entries.
- **Tier 1 — Adjacent APIs**: DONE (v1.1.0) — Indexing API, PageSpeed Insights, CrUX, sites CRUD, mobile-friendly test
- **Tier 2 — Computed v2**: Indexing health report, cannibalization resolver, SERP feature tracking, page-level health dashboard, automated drop alerts

When adding new tool groups, add service methods to `service.ts` and new groups under `schemas/` + `tools/`. Follow existing group pattern.

## Gotchas
- Zod `.default().optional()` vs `.optional().default()` — order matters. Use `.optional().default()` for "missing key gets default".
- MCP SDK `ServerResult` requires index signature on return types.
- `googleapis` inferred types reference internal `gaxios` — avoid `declaration: true` in tsconfig or add explicit return types.
- GSC API has 2-3 day data lag by default. Use `dataState: "all"` for fresh data.
- URL Inspection API quota: 2,000/day, 600/min per property — plan batch_inspect accordingly.
- Google Indexing API officially limited to JobPosting/BroadcastEvent schema types only.
- PageSpeed Insights API is free, no auth required — separate from authenticated GSC calls.
- CrUX API needs a Google Cloud API key, not the service account.
