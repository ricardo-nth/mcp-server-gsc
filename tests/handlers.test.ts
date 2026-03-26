import { describe, it, expect, vi } from 'vitest';
import { handleBatchInspect, handleComparePeriods } from '../src/tools/computed.js';
import { handleDetectQuickWins, handleSearchAnalyticsCursor } from '../src/tools/analytics.js';
import {
  handleIndexingHealthReport,
  handlePageHealthDashboard,
  handleSerpFeatureTracking,
  handleDropAlerts,
} from '../src/tools/computed2.js';
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

  it('detect_quick_wins adds intent and cluster when intentAware is enabled', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: {
          rows: [
            {
              keys: ['best crm software', 'https://example.com/crm'],
              clicks: 5,
              impressions: 300,
              ctr: 0.01,
              position: 6,
            },
          ],
        },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleDetectQuickWins(service, {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      intentAware: true,
    });
    const payload = parseResult(result);
    const first = (payload.quickWins as Array<Record<string, unknown>>)[0];

    expect(first.intent).toBe('commercial');
    expect(typeof first.cluster).toBe('string');
  });

  it('search_analytics_cursor returns nextCursor for incremental retrieval', async () => {
    const service = {
      searchAnalytics: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            rows: [
              { keys: ['query-1'], clicks: 10, impressions: 100 },
              { keys: ['query-2'], clicks: 8, impressions: 70 },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: {
            rows: [{ keys: ['query-3'], clicks: 4, impressions: 50 }],
          },
        }),
    } as unknown as SearchConsoleService;

    const first = parseResult(
      await handleSearchAnalyticsCursor(service, {
        siteUrl: 'sc-domain:example.com',
        days: 7,
        dimensions: ['query'],
        pageSize: 2,
        maxRows: 3,
      }),
    );

    const firstPageInfo = first.pageInfo as Record<string, unknown>;
    expect(firstPageInfo.hasMore).toBe(true);
    expect(typeof firstPageInfo.nextCursor).toBe('string');

    const second = parseResult(
      await handleSearchAnalyticsCursor(service, {
        siteUrl: 'sc-domain:example.com',
        days: 7,
        cursor: firstPageInfo.nextCursor,
      }),
    );
    const secondPageInfo = second.pageInfo as Record<string, unknown>;

    expect(secondPageInfo.hasMore).toBe(false);
    expect(secondPageInfo.nextCursor).toBeNull();
    expect((second.rows as Array<Record<string, unknown>>).length).toBe(1);
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

  it('batch_inspect returns partial failures instead of failing the whole call', async () => {
    const service = {
      indexInspect: vi
        .fn()
        .mockResolvedValueOnce({ data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } } })
        .mockRejectedValueOnce(new Error('Permission denied')),
    } as unknown as SearchConsoleService;

    const result = await handleBatchInspect(service, {
      siteUrl: 'sc-domain:example.com',
      urls: ['https://example.com/ok', 'https://example.com/fail'],
      languageCode: 'en-US',
    });
    const payload = parseResult(result);
    const inspections = payload.inspections as Array<Record<string, unknown>>;

    expect(payload.total).toBe(2);
    expect(payload.successCount).toBe(1);
    expect(payload.errorCount).toBe(1);
    expect(inspections[0]?.error).toBeNull();
    expect(inspections[1]?.error).toContain('Permission denied');
  });

  it('indexing_health_report supports manual URL source', async () => {
    const service = {
      indexInspect: vi.fn().mockResolvedValue({
        data: {
          inspectionResult: {
            indexStatusResult: {
              verdict: 'PASS',
              coverageState: 'Submitted and indexed',
            },
          },
        },
      }),
      searchAnalytics: vi.fn(),
    } as unknown as SearchConsoleService;

    const result = await handleIndexingHealthReport(service, {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      source: 'manual',
      urls: ['https://example.com/a', 'https://example.com/b'],
      topN: 2,
    });
    const payload = parseResult(result);

    expect(payload.source).toBe('manual');
    expect((service.searchAnalytics as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect((service.indexInspect as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    expect(payload.totalUrls).toBe(2);
  });

  it('indexing_health_report supports combined source with sitemap deduplication', async () => {
    const service = {
      indexInspect: vi.fn().mockResolvedValue({
        data: {
          inspectionResult: {
            indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed' },
          },
        },
      }),
      searchAnalytics: vi.fn().mockResolvedValue({
        data: {
          rows: [{ keys: ['https://example.com/a'] }, { keys: ['https://example.com/b'] }],
        },
      }),
    } as unknown as SearchConsoleService;

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true,
        text: async () =>
          '<urlset><url><loc>https://example.com/b</loc></url><url><loc>https://example.com/c</loc></url></urlset>',
      } as unknown as Response);

    const result = await handleIndexingHealthReport(service, {
      siteUrl: 'sc-domain:example.com',
      source: 'combined',
      sitemapUrls: ['https://example.com/sitemap.xml'],
      topN: 10,
    });
    const payload = parseResult(result);

    fetchMock.mockRestore();

    expect(payload.source).toBe('combined');
    expect(payload.totalUrls).toBe(2);
    expect(payload.byTemplate).toBeDefined();
  });

  it('drop_alerts includes change-point output when enabled', async () => {
    const service = {
      searchAnalytics: vi
        .fn()
        .mockResolvedValueOnce({
          data: { rows: [{ keys: ['https://example.com/a'], clicks: 10, impressions: 100, position: 8 }] },
        })
        .mockResolvedValueOnce({
          data: { rows: [{ keys: ['https://example.com/a'], clicks: 100, impressions: 500, position: 3 }] },
        })
        .mockResolvedValueOnce({
          data: {
            rows: [
              { keys: ['2026-01-01', 'https://example.com/a'], ctr: 0.2, position: 3 },
              { keys: ['2026-01-02', 'https://example.com/a'], ctr: 0.19, position: 3.1 },
              { keys: ['2026-01-03', 'https://example.com/a'], ctr: 0.05, position: 8.5 },
              { keys: ['2026-01-04', 'https://example.com/a'], ctr: 0.04, position: 9 },
            ],
          },
        }),
    } as unknown as SearchConsoleService;

    const result = await handleDropAlerts(service, {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      threshold: 50,
      includeChangePoints: true,
    });
    const payload = parseResult(result);

    expect(payload.alertCount).toBe(1);
    expect(payload.changePointsByPage).toBeDefined();
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
