import { describe, it, expect, vi } from 'vitest';
import { handleSearchAnalyticsCursor } from '../src/tools/analytics.js';
import type { SearchConsoleService } from '../src/service.js';
import { RuntimeCoordinator } from '../src/utils/runtime.js';

describe('Load behavior tests', () => {
  it('streams 100k rows via cursor pages without a single huge response', async () => {
    const service = {
      searchAnalytics: vi.fn().mockImplementation(async (_siteUrl: string, body: Record<string, unknown>) => {
        const startRow = Number(body.startRow ?? 0);
        const rowLimit = Number(body.rowLimit ?? 5000);
        const maxRows = 100000;
        const remaining = Math.max(0, maxRows - startRow);
        const count = Math.min(rowLimit, remaining);
        const rows = Array.from({ length: count }, (_, idx) => ({
          keys: [`query-${startRow + idx}`],
          clicks: 1,
          impressions: 10,
          ctr: 0.1,
          position: 5,
        }));
        return { data: { rows } };
      }),
    } as unknown as SearchConsoleService;

    let cursor: string | undefined;
    let totalRows = 0;
    let pages = 0;

    do {
      const result = await handleSearchAnalyticsCursor(service, {
        siteUrl: 'sc-domain:example.com',
        days: 28,
        dimensions: ['query'],
        pageSize: 5000,
        maxRows: 100000,
        ...(cursor ? { cursor } : {}),
      });

      const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
      const rows = payload.rows as Array<Record<string, unknown>>;
      const pageInfo = payload.pageInfo as Record<string, unknown>;

      totalRows += rows.length;
      pages += 1;
      expect(rows.length).toBeLessThanOrEqual(5000);

      cursor = (pageInfo.nextCursor as string | null) ?? undefined;
    } while (cursor);

    expect(totalRows).toBe(100000);
    expect(pages).toBe(20);
  });

  it('enforces concurrency limit under burst load', async () => {
    const previousGlobal = process.env.GSC_GLOBAL_CONCURRENCY;
    const previousTool = process.env.GSC_TOOL_CONCURRENCY_SEARCH_ANALYTICS;
    process.env.GSC_GLOBAL_CONCURRENCY = '2';
    process.env.GSC_TOOL_CONCURRENCY_SEARCH_ANALYTICS = '2';

    try {
      const runtime = new RuntimeCoordinator();
      let active = 0;
      let maxActive = 0;

      await Promise.all(
        Array.from({ length: 25 }, () =>
          runtime.withConcurrencyLimit('search_analytics', async () => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active -= 1;
            return null;
          }),
        ),
      );

      expect(maxActive).toBeLessThanOrEqual(2);
    } finally {
      if (previousGlobal === undefined) {
        delete process.env.GSC_GLOBAL_CONCURRENCY;
      } else {
        process.env.GSC_GLOBAL_CONCURRENCY = previousGlobal;
      }
      if (previousTool === undefined) {
        delete process.env.GSC_TOOL_CONCURRENCY_SEARCH_ANALYTICS;
      } else {
        process.env.GSC_TOOL_CONCURRENCY_SEARCH_ANALYTICS = previousTool;
      }
    }
  });
});
