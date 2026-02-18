import { describe, it, expect, vi } from 'vitest';
import { handleComparePeriods } from '../src/tools/computed.js';
import { handlePageHealthDashboard } from '../src/tools/computed2.js';
import type { SearchConsoleService } from '../src/service.js';
import type { ToolResult } from '../src/utils/types.js';

function parseResult(result: ToolResult): Record<string, unknown> {
  const text = result.content[0]?.text ?? '{}';
  return JSON.parse(text) as Record<string, unknown>;
}

describe('Tool handlers', () => {
  it('compare_periods includes keys that existed only in the previous period', async () => {
    const service = {
      searchAnalytics: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            rows: [
              { keys: ['steady'], clicks: 10, impressions: 100, ctr: 0.1, position: 3 },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: {
            rows: [
              { keys: ['steady'], clicks: 5, impressions: 80, ctr: 0.0625, position: 4 },
              { keys: ['lost'], clicks: 40, impressions: 400, ctr: 0.1, position: 2 },
            ],
          },
        }),
    } as unknown as SearchConsoleService;

    const result = await handleComparePeriods(service, {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      rowLimit: 1000,
    });
    const payload = parseResult(result);
    const comparisons = payload.comparisons as Array<Record<string, unknown>>;
    const lost = comparisons.find((row) => (row.keys as string[])[0] === 'lost');

    expect(lost).toBeDefined();
    expect((lost?.periodA as Record<string, number>).clicks).toBe(0);
    expect((lost?.periodB as Record<string, number>).clicks).toBe(40);
    expect((lost?.delta as Record<string, number>).clicks).toBe(-40);
  });

  it('page_health_dashboard reports CrUX errors instead of returning null silently', async () => {
    const cruxError = new Error(
      'GOOGLE_CLOUD_API_KEY environment variable is required for CrUX API tools.',
    );

    const service = {
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      searchAnalytics: vi.fn().mockResolvedValue({
        data: {
          rows: [
            { clicks: 12, impressions: 100, ctr: 0.12, position: 3.2 },
          ],
        },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: {
          lighthouseResult: { categories: { performance: { score: 0.91 } } },
          loadingExperience: {
            metrics: { largest_contentful_paint_ms: { percentile: 2400 } },
            overall_category: 'FAST',
          },
        },
      }),
      cruxQueryRecord: vi.fn().mockRejectedValue(cruxError),
    } as unknown as SearchConsoleService;

    const result = await handlePageHealthDashboard(service, {
      siteUrl: 'sc-domain:example.com',
      url: 'https://example.com/page',
      days: 7,
    });
    const payload = parseResult(result);
    const crux = payload.crux as Record<string, string>;

    expect(crux.error).toContain('GOOGLE_CLOUD_API_KEY');
  });
});
