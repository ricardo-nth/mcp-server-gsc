import { SearchConsoleService } from '../service.js';
import {
  ComparePeriodsSchema,
  ContentDecaySchema,
  CannibalizationSchema,
  DiffKeywordsSchema,
  BatchInspectSchema,
  CtrAnalysisSchema,
  SearchTypeBreakdownSchema,
} from '../schemas/computed.js';
import { comparePeriods, resolveDateRange } from '../utils/dates.js';
import { rateLimited } from '../utils/retry.js';
import { jsonResult, type ToolResult, type SearchAnalyticsRow } from '../utils/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Key function for grouping rows by their dimension keys */
function rowKey(row: SearchAnalyticsRow): string {
  return (row.keys ?? []).join('||');
}

/** Compute percentage change, handling zero-division */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? Infinity : null;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

/** Average position CTR benchmarks (rough Google organic) */
const CTR_BENCHMARKS: Record<number, number> = {
  1: 28.5,
  2: 15.7,
  3: 11.0,
  4: 8.0,
  5: 7.2,
  6: 5.1,
  7: 4.0,
  8: 3.2,
  9: 2.8,
  10: 2.5,
};

function expectedCtr(position: number): number {
  const rounded = Math.min(Math.max(Math.round(position), 1), 10);
  return CTR_BENCHMARKS[rounded] ?? 2.0;
}

// ---------------------------------------------------------------------------
// compare_periods
// ---------------------------------------------------------------------------

export async function handleComparePeriods(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = ComparePeriodsSchema.parse(raw);
  const { periodA, periodB } = comparePeriods(args.days);

  const baseBody: Record<string, unknown> = {
    dimensions: args.dimensions ?? ['query'],
    rowLimit: args.rowLimit,
    searchType: args.type,
  };

  const [resA, resB] = await Promise.all([
    service.searchAnalytics(args.siteUrl, {
      ...baseBody,
      startDate: periodA.startDate,
      endDate: periodA.endDate,
    }),
    service.searchAnalytics(args.siteUrl, {
      ...baseBody,
      startDate: periodB.startDate,
      endDate: periodB.endDate,
    }),
  ]);

  const dataA = (resA.data as { rows?: SearchAnalyticsRow[] }).rows ?? [];
  const dataB = (resB.data as { rows?: SearchAnalyticsRow[] }).rows ?? [];

  // Index period B by key
  const mapB = new Map<string, SearchAnalyticsRow>();
  for (const row of dataB) mapB.set(rowKey(row), row);

  const comparisons = dataA.map((rowA) => {
    const key = rowKey(rowA);
    const rowB = mapB.get(key);
    const clicksA = rowA.clicks ?? 0;
    const clicksB = rowB?.clicks ?? 0;
    const imprA = rowA.impressions ?? 0;
    const imprB = rowB?.impressions ?? 0;
    const ctrA = (rowA.ctr ?? 0) * 100;
    const ctrB = (rowB?.ctr ?? 0) * 100;
    const posA = rowA.position ?? 0;
    const posB = rowB?.position ?? 0;

    return {
      keys: rowA.keys,
      periodA: { clicks: clicksA, impressions: imprA, ctr: Number(ctrA.toFixed(2)), position: Number(posA.toFixed(1)) },
      periodB: { clicks: clicksB, impressions: imprB, ctr: Number(ctrB.toFixed(2)), position: Number(posB.toFixed(1)) },
      delta: {
        clicks: clicksA - clicksB,
        impressions: imprA - imprB,
        ctr: Number((ctrA - ctrB).toFixed(2)),
        position: Number((posA - posB).toFixed(1)),
        clicksPct: pctChange(clicksA, clicksB),
        impressionsPct: pctChange(imprA, imprB),
      },
    };
  });

  // Sort by absolute click change descending
  comparisons.sort((a, b) => Math.abs(b.delta.clicks) - Math.abs(a.delta.clicks));

  return jsonResult({
    periodA,
    periodB,
    totalRows: comparisons.length,
    comparisons,
  });
}

// ---------------------------------------------------------------------------
// detect_content_decay
// ---------------------------------------------------------------------------

export async function handleContentDecay(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = ContentDecaySchema.parse(raw);
  const halfDays = Math.floor(args.days / 2);
  const { periodA, periodB } = comparePeriods(halfDays);

  // periodA = recent, periodB = earlier
  const baseBody: Record<string, unknown> = {
    dimensions: ['page'],
    rowLimit: args.rowLimit,
  };

  const [resRecent, resPrior] = await Promise.all([
    service.searchAnalytics(args.siteUrl, {
      ...baseBody,
      startDate: periodA.startDate,
      endDate: periodA.endDate,
    }),
    service.searchAnalytics(args.siteUrl, {
      ...baseBody,
      startDate: periodB.startDate,
      endDate: periodB.endDate,
    }),
  ]);

  const recent = (resRecent.data as { rows?: SearchAnalyticsRow[] }).rows ?? [];
  const prior = (resPrior.data as { rows?: SearchAnalyticsRow[] }).rows ?? [];

  // Index recent by page URL
  const recentMap = new Map<string, SearchAnalyticsRow>();
  for (const row of recent) recentMap.set(rowKey(row), row);

  const decaying = prior
    .filter((row) => (row.clicks ?? 0) >= args.minClicksInPrior)
    .map((priorRow) => {
      const key = rowKey(priorRow);
      const recentRow = recentMap.get(key);
      const clicksPrior = priorRow.clicks ?? 0;
      const clicksRecent = recentRow?.clicks ?? 0;
      const clicksLost = clicksPrior - clicksRecent;

      return {
        page: priorRow.keys?.[0] ?? 'N/A',
        clicksPrior,
        clicksRecent,
        clicksLost,
        decayPct: pctChange(clicksRecent, clicksPrior),
        impressionsPrior: priorRow.impressions ?? 0,
        impressionsRecent: recentRow?.impressions ?? 0,
        positionPrior: Number((priorRow.position ?? 0).toFixed(1)),
        positionRecent: Number((recentRow?.position ?? 0).toFixed(1)),
      };
    })
    .filter((d) => d.clicksLost > 0)
    .sort((a, b) => b.clicksLost - a.clicksLost);

  return jsonResult({
    recentPeriod: periodA,
    priorPeriod: periodB,
    minClicksInPrior: args.minClicksInPrior,
    decayingPages: decaying.length,
    pages: decaying,
  });
}

// ---------------------------------------------------------------------------
// detect_cannibalization
// ---------------------------------------------------------------------------

export async function handleCannibalization(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = CannibalizationSchema.parse(raw);
  const { startDate, endDate } = resolveDateRange(args);

  const response = await service.searchAnalytics(args.siteUrl, {
    startDate,
    endDate,
    dimensions: ['query', 'page'],
    rowLimit: args.rowLimit,
  });

  const rows = (response.data as { rows?: SearchAnalyticsRow[] }).rows ?? [];

  // Group by query
  const queryMap = new Map<string, Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>>();

  for (const row of rows) {
    const query = row.keys?.[0] ?? '';
    const page = row.keys?.[1] ?? '';
    if (!queryMap.has(query)) queryMap.set(query, []);
    queryMap.get(query)!.push({
      page,
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: (row.ctr ?? 0) * 100,
      position: row.position ?? 0,
    });
  }

  // Find queries with multiple pages
  const cannibalized = Array.from(queryMap.entries())
    .filter(([, pages]) => pages.length >= 2)
    .map(([query, pages]) => {
      const totalImpressions = pages.reduce((s, p) => s + p.impressions, 0);
      if (totalImpressions < args.minImpressions) return null;

      // Position variance indicates inconsistent ranking
      const positions = pages.map((p) => p.position);
      const avgPos = positions.reduce((s, p) => s + p, 0) / positions.length;
      const variance =
        positions.reduce((s, p) => s + Math.pow(p - avgPos, 2), 0) /
        positions.length;

      return {
        query,
        pageCount: pages.length,
        totalImpressions,
        positionVariance: Number(variance.toFixed(2)),
        pages: pages
          .sort((a, b) => b.impressions - a.impressions)
          .map((p) => ({
            ...p,
            ctr: Number(p.ctr.toFixed(2)),
            position: Number(p.position.toFixed(1)),
          })),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.totalImpressions - a!.totalImpressions);

  return jsonResult({
    dateRange: { startDate, endDate },
    cannibalizationIssues: cannibalized.length,
    queries: cannibalized,
  });
}

// ---------------------------------------------------------------------------
// diff_keywords
// ---------------------------------------------------------------------------

export async function handleDiffKeywords(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = DiffKeywordsSchema.parse(raw);
  const { periodA, periodB } = comparePeriods(args.days);

  const baseBody: Record<string, unknown> = {
    dimensions: ['query'],
    rowLimit: args.rowLimit,
  };

  const [resA, resB] = await Promise.all([
    service.searchAnalytics(args.siteUrl, {
      ...baseBody,
      startDate: periodA.startDate,
      endDate: periodA.endDate,
    }),
    service.searchAnalytics(args.siteUrl, {
      ...baseBody,
      startDate: periodB.startDate,
      endDate: periodB.endDate,
    }),
  ]);

  const rowsA = (resA.data as { rows?: SearchAnalyticsRow[] }).rows ?? [];
  const rowsB = (resB.data as { rows?: SearchAnalyticsRow[] }).rows ?? [];

  const setA = new Map<string, SearchAnalyticsRow>();
  const setB = new Map<string, SearchAnalyticsRow>();
  for (const r of rowsA) setA.set(r.keys?.[0] ?? '', r);
  for (const r of rowsB) setB.set(r.keys?.[0] ?? '', r);

  const newKeywords: Array<{ query: string; clicks: number; impressions: number; position: number }> = [];
  const lostKeywords: Array<{ query: string; clicks: number; impressions: number; position: number }> = [];

  // New: in A but not B
  for (const [query, row] of setA) {
    if (!setB.has(query) && (row.impressions ?? 0) >= args.minImpressions) {
      newKeywords.push({
        query,
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        position: Number((row.position ?? 0).toFixed(1)),
      });
    }
  }

  // Lost: in B but not A
  for (const [query, row] of setB) {
    if (!setA.has(query) && (row.impressions ?? 0) >= args.minImpressions) {
      lostKeywords.push({
        query,
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        position: Number((row.position ?? 0).toFixed(1)),
      });
    }
  }

  newKeywords.sort((a, b) => b.impressions - a.impressions);
  lostKeywords.sort((a, b) => b.impressions - a.impressions);

  return jsonResult({
    periodA,
    periodB,
    newKeywords: { count: newKeywords.length, keywords: newKeywords },
    lostKeywords: { count: lostKeywords.length, keywords: lostKeywords },
  });
}

// ---------------------------------------------------------------------------
// batch_inspect
// ---------------------------------------------------------------------------

export async function handleBatchInspect(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = BatchInspectSchema.parse(raw);

  // Rate-limit to 1 request per second as per GSC API limits
  const fns = args.urls.map(
    (url) => () =>
      service.indexInspect({
        siteUrl: args.siteUrl,
        inspectionUrl: url,
        languageCode: args.languageCode,
      }),
  );

  const results = await rateLimited(fns, 1000);

  const inspections = results.map((res, i) => ({
    url: args.urls[i],
    result: res.data,
  }));

  return jsonResult({
    total: inspections.length,
    inspections,
  });
}

// ---------------------------------------------------------------------------
// ctr_analysis
// ---------------------------------------------------------------------------

export async function handleCtrAnalysis(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = CtrAnalysisSchema.parse(raw);
  const { startDate, endDate } = resolveDateRange(args);

  const response = await service.searchAnalytics(args.siteUrl, {
    startDate,
    endDate,
    dimensions: ['query'],
    rowLimit: args.rowLimit,
  });

  const rows = (response.data as { rows?: SearchAnalyticsRow[] }).rows ?? [];

  const analysis = rows
    .filter((row) => (row.impressions ?? 0) >= args.minImpressions)
    .map((row) => {
      const position = row.position ?? 0;
      const actualCtr = (row.ctr ?? 0) * 100;
      const expected = expectedCtr(position);
      const gap = Number((actualCtr - expected).toFixed(2));

      return {
        query: row.keys?.[0] ?? 'N/A',
        position: Number(position.toFixed(1)),
        impressions: row.impressions ?? 0,
        clicks: row.clicks ?? 0,
        actualCtr: Number(actualCtr.toFixed(2)),
        expectedCtr: expected,
        ctrGap: gap,
        status: gap >= 0 ? 'above_benchmark' : 'below_benchmark',
      };
    })
    .sort((a, b) => a.ctrGap - b.ctrGap); // worst underperformers first

  const underperformers = analysis.filter((a) => a.status === 'below_benchmark');
  const overperformers = analysis.filter((a) => a.status === 'above_benchmark');

  return jsonResult({
    dateRange: { startDate, endDate },
    totalAnalyzed: analysis.length,
    underperformers: underperformers.length,
    overperformers: overperformers.length,
    queries: analysis,
  });
}

// ---------------------------------------------------------------------------
// search_type_breakdown
// ---------------------------------------------------------------------------

export async function handleSearchTypeBreakdown(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = SearchTypeBreakdownSchema.parse(raw);
  const { startDate, endDate } = resolveDateRange(args);

  const requests = args.types.map((type) =>
    service
      .searchAnalytics(args.siteUrl, {
        startDate,
        endDate,
        searchType: type,
      })
      .then((res) => {
        const data = res.data as {
          rows?: SearchAnalyticsRow[];
        };
        const rows = data.rows ?? [];
        let clicks = 0;
        let impressions = 0;
        for (const row of rows) {
          clicks += row.clicks ?? 0;
          impressions += row.impressions ?? 0;
        }
        return {
          type,
          clicks,
          impressions,
          ctr:
            impressions > 0
              ? Number(((clicks / impressions) * 100).toFixed(2))
              : 0,
        };
      }),
  );

  const breakdown = await Promise.all(requests);
  breakdown.sort((a, b) => b.clicks - a.clicks);

  const totalClicks = breakdown.reduce((s, b) => s + b.clicks, 0);
  const withShare = breakdown.map((b) => ({
    ...b,
    clickShare:
      totalClicks > 0
        ? Number(((b.clicks / totalClicks) * 100).toFixed(1))
        : 0,
  }));

  return jsonResult({
    dateRange: { startDate, endDate },
    breakdown: withShare,
  });
}
