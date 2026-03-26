# mcp-server-gsc-pro

## Key Patterns

- All tools return `ToolResult` (has `[key: string]: unknown` index signature for MCP SDK compat)
- `jsonResult()` / `errorResult()` helpers in `utils/types.ts`
- `resolveDateRange()` in `utils/dates.ts` — all date-based tools accept `days` OR `startDate`/`endDate`
- Service methods wrapped in `withRetry()` + `withPermissionFallback()`
- Custom error types: `GSCAuthError`, `GSCQuotaError`, `GSCPermissionError`
- When adding new tool groups, add service methods to `service.ts` and new groups under `schemas/` + `tools/`. Follow existing group pattern.

## Gotchas

- Zod `.default().optional()` vs `.optional().default()` — order matters. Use `.optional().default()` for "missing key gets default".
- MCP SDK `ServerResult` requires index signature on return types.
- `googleapis` inferred types reference internal `gaxios` — avoid `declaration: true` in tsconfig or add explicit return types.
- GSC API has 2-3 day data lag by default. Use `dataState: "all"` for fresh data.
- URL Inspection API quota: 2,000/day, 600/min per property — plan batch_inspect accordingly.
- Google Indexing API officially limited to JobPosting/BroadcastEvent schema types only.
- PageSpeed Insights API is free, no auth required — separate from authenticated GSC calls.
- CrUX API needs a Google Cloud API key, not the service account.
