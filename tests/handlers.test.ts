import { describe, it, expect, vi } from 'vitest';
import { handleComparePeriods } from '../src/tools/computed.js';
import { handleDetectQuickWins } from '../src/tools/analytics.js';
import { handlePageHealthDashboard, handleSerpFeatureTracking } from '../src/tools/computed2.js';
import { handlePageSpeedInsights } from '../src/tools/pagespeed.js';
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

  it('compare_periods serializes infinite percentage deltas as strings', async () => {
    const service = {
      searchAnalytics: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            rows: [{ keys: ['new'], clicks: 10, impressions: 100, ctr: 0.1, position: 3 }],
          },
        })
        .mockResolvedValueOnce({
          data: {
            rows: [],
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
    const fresh = comparisons.find((row) => (row.keys as string[])[0] === 'new');

    expect((fresh?.delta as Record<string, unknown>).clicksPct).toBe('Infinity');
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

  it('detect_quick_wins paginates when maxRows exceeds 25K', async () => {
    const service = {
      searchAnalytics: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            rows: Array.from({ length: 25000 }, (_, i) => ({
              keys: [`query-${i}`, `https://example.com/${i}`],
              clicks: 1,
              impressions: 100,
              ctr: 0.01,
              position: 5,
            })),
          },
        })
        .mockResolvedValueOnce({
          data: {
            rows: [
              {
                keys: ['extra-query', 'https://example.com/extra'],
                clicks: 1,
                impressions: 100,
                ctr: 0.01,
                position: 5,
              },
            ],
          },
        }),
    } as unknown as SearchConsoleService;

    const result = await handleDetectQuickWins(service, {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      maxRows: 26000,
    });
    const payload = parseResult(result);

    expect((service.searchAnalytics as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    expect(payload.rowsAnalyzed).toBe(25001);
  });

  it('pagespeed_insights falls back to input URL when response id is missing', async () => {
    const service = {
      runPageSpeed: vi.fn().mockResolvedValue({
        data: {
          analysisUTCTimestamp: '2026-02-18T00:00:00.000Z',
          lighthouseResult: {},
        },
      }),
    } as unknown as SearchConsoleService;

    const result = await handlePageSpeedInsights(service, {
      url: 'https://example.com/page',
      categories: ['performance'],
      strategy: 'mobile',
    });
    const payload = parseResult(result);

    expect(payload.url).toBe('https://example.com/page');
  });

  it('serp_feature_tracking preserves explicit date ranges in chunked windows', async () => {
    const service = {
      searchAnalytics: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            rows: [{ keys: ['FAQ rich results'], clicks: 10, impressions: 100, ctr: 0.1 }],
          },
        })
        .mockResolvedValueOnce({
          data: {
            rows: [{ keys: ['FAQ rich results'], clicks: 4, impressions: 40, ctr: 0.1 }],
          },
        }),
    } as unknown as SearchConsoleService;

    const result = await handleSerpFeatureTracking(service, {
      siteUrl: 'sc-domain:example.com',
      startDate: '2026-01-01',
      endDate: '2026-01-10',
    });
    const payload = parseResult(result);
    const features = payload.features as Array<Record<string, unknown>>;
    const trend = (features[0]?.trend ?? []) as Array<Record<string, unknown>>;

    expect((service.searchAnalytics as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      [
        'sc-domain:example.com',
        {
          startDate: '2026-01-01',
          endDate: '2026-01-07',
          dimensions: ['searchAppearance'],
          rowLimit: 5000,
        },
      ],
      [
        'sc-domain:example.com',
        {
          startDate: '2026-01-08',
          endDate: '2026-01-10',
          dimensions: ['searchAppearance'],
          rowLimit: 5000,
        },
      ],
    ]);
    expect(payload.totalWindows).toBe(2);
    expect(trend.map((item) => item.period)).toEqual(['2026-01-01/2026-01-07', '2026-01-08/2026-01-10']);
  });
});
