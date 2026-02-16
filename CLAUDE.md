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
  schemas/          ← Zod schemas per tool group (base, analytics, inspection, sitemaps, computed)
  tools/            ← Tool handler functions per group (analytics, inspection, sitemaps, computed)
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

## Gotchas
- Zod `.default().optional()` vs `.optional().default()` — order matters. Use `.optional().default()` for "missing key gets default".
- MCP SDK `ServerResult` requires index signature on return types.
- `googleapis` inferred types reference internal `gaxios` — avoid `declaration: true` in tsconfig or add explicit return types.
- GSC API has 2-3 day data lag by default. Use `dataState: "all"` for fresh data.
