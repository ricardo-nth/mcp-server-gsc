import { SearchConsoleService } from '../service.js';
import {
  PageHealthDashboardSchema,
  IndexingHealthReportSchema,
  SerpFeatureTrackingSchema,
  CannibalizationResolverSchema,
  DropAlertsSchema,
} from '../schemas/computed2.js';
import { resolveDateRange, comparePeriods, rollingWindows } from '../utils/dates.js';
import { rateLimited } from '../utils/retry.js';
import { jsonResult, type ToolResult, type SearchAnalyticsRow } from '../utils/types.js';

// ---------------------------------------------------------------------------
// page_health_dashboard
// ---------------------------------------------------------------------------

export async function handlePageHealthDashboard(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = PageHealthDashboardSchema.parse(raw);
  const { startDate, endDate } = resolveDateRange(args);

  // Fire all 4 API calls in parallel — each section tolerates independent failure
  const [inspectionResult, analyticsResult, psiResult, cruxResult] =
    await Promise.allSettled([
      service.indexInspect({
        siteUrl: args.siteUrl,
        inspectionUrl: args.url,
        languageCode: args.languageCode,
      }),
      service.searchAnalytics(args.siteUrl, {
        startDate,
        endDate,
        dimensions: ['page'],
        dimensionFilterGroups: [
          {
            groupType: 'and',
            filters: [
              { dimension: 'page', operator: 'equals', expression: args.url },
            ],
          },
        ],
        rowLimit: 1,
      }),
      service.runPageSpeed({
        url: args.url,
        categories: [...args.categories],
        strategy: args.strategy,
      }),
      service.cruxQueryRecord({ url: args.url }),
    ]);

  const dashboard: Record<string, unknown> = {
    url: args.url,
    siteUrl: args.siteUrl,
    dateRange: { startDate, endDate },
  };

  // Inspection
  if (inspectionResult.status === 'fulfilled') {
    const data = inspectionResult.value.data as Record<string, unknown>;
    dashboard.inspection = data?.inspectionResult ?? data;
  } else {
    dashboard.inspection = {
      error: (inspectionResult.reason as Error)?.message ?? 'Inspection failed',
    };
  }

  // Analytics
  if (analyticsResult.status === 'fulfilled') {
    const rows =
      (analyticsResult.value.data as { rows?: SearchAnalyticsRow[] }).rows ?? [];
    const row = rows[0];
    dashboard.analytics = row
      ? {
          clicks: row.clicks ?? 0,
          impressions: row.impressions ?? 0,
          ctr: Number(((row.ctr ?? 0) * 100).toFixed(2)),
          position: Number((row.position ?? 0).toFixed(1)),
        }
      : {
          clicks: 0,
          impressions: 0,
          ctr: 0,
          position: 0,
          note: 'No data for this URL in date range',
        };
  } else {
    dashboard.analytics = {
      error: (analyticsResult.reason as Error)?.message ?? 'Analytics failed',
    };
  }

  // PageSpeed Insights
  if (psiResult.status === 'fulfilled') {
    const psiData = psiResult.value.data as Record<string, unknown>;
    const lighthouse = psiData.lighthouseResult as Record<string, unknown> | undefined;
    const categories = lighthouse?.categories as
      | Record<string, { score?: number }>
      | undefined;
    const loadingExp = psiData.loadingExperience as
      | { metrics?: unknown; overall_category?: string }
      | undefined;

    dashboard.pageSpeed = {
      scores: categories
        ? Object.fromEntries(
            Object.entries(categories).map(([key, cat]) => [
              key,
              (cat.score ?? 0) * 100,
            ]),
          )
        : null,
      fieldData: loadingExp?.metrics ?? null,
      overallCategory: loadingExp?.overall_category ?? null,
    };
  } else {
    dashboard.pageSpeed = {
      error: (psiResult.reason as Error)?.message ?? 'PageSpeed failed',
    };
  }

  // CrUX
  if (cruxResult.status === 'fulfilled') {
    dashboard.crux = (cruxResult.value as { data?: unknown })?.data ?? null;
  } else {
    const reason = cruxResult.reason as {
      message?: string;
      code?: string;
    };
    dashboard.crux = {
      error: reason?.message ?? 'CrUX failed',
      ...(reason?.code ? { code: reason.code } : {}),
    };
  }

  return jsonResult(dashboard);
}

// ---------------------------------------------------------------------------
// indexing_health_report
// ---------------------------------------------------------------------------

export async function handleIndexingHealthReport(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = IndexingHealthReportSchema.parse(raw);

  // Step 1: Collect URLs from top analytics pages
  const { startDate, endDate } = resolveDateRange(args);
  const analyticsRes = await service.searchAnalytics(args.siteUrl, {
    startDate,
    endDate,
    dimensions: ['page'],
    rowLimit: args.topN,
  });
  const rows =
    (analyticsRes.data as { rows?: SearchAnalyticsRow[] }).rows ?? [];
  const urls = rows
    .map((row) => row.keys?.[0])
    .filter((u): u is string => !!u)
    .slice(0, args.topN);

  if (urls.length === 0) {
    return jsonResult({
      siteUrl: args.siteUrl,
      source: args.source,
      totalUrls: 0,
      note: 'No URLs found from the specified source',
      summary: {},
      urls: [],
    });
  }

  // Step 2: Rate-limited batch inspection (1 req/sec)
  const fns = urls.map(
    (url) => () =>
      service
        .indexInspect({
          siteUrl: args.siteUrl,
          inspectionUrl: url,
          languageCode: args.languageCode,
        })
        .then((res) => ({ url, result: res.data, error: null as string | null }))
        .catch((err: Error) => ({
          url,
          result: null as unknown,
          error: err?.message ?? 'Inspection failed',
        })),
  );

  const inspections = await rateLimited(fns, 1000);

  // Step 3: Aggregate by coverage state
  const byCoverageState: Record<string, number> = {};
  let indexed = 0;
  let notIndexed = 0;
  let inspectionErrors = 0;

  for (const item of inspections) {
    if (item.error) {
      inspectionErrors++;
      continue;
    }
    const inspection = (item.result as Record<string, unknown>)
      ?.inspectionResult as Record<string, unknown> | undefined;
    const indexStatus = inspection?.indexStatusResult as
      | Record<string, unknown>
      | undefined;
    const coverageState = (indexStatus?.coverageState as string) ?? 'UNKNOWN';
    const verdict = (indexStatus?.verdict as string) ?? 'UNKNOWN';

    byCoverageState[coverageState] = (byCoverageState[coverageState] ?? 0) + 1;

    if (verdict === 'PASS') {
      indexed++;
    } else {
      notIndexed++;
    }
  }

  return jsonResult({
    siteUrl: args.siteUrl,
    source: args.source,
    totalUrls: urls.length,
    quotaUsed: inspections.length,
    indexed,
    notIndexed,
    inspectionErrors,
    byCoverageState,
    urls: inspections.map((item) => {
      const inspection = (item.result as Record<string, unknown>)
        ?.inspectionResult as Record<string, unknown> | undefined;
      const indexStatus = inspection?.indexStatusResult as
        | Record<string, unknown>
        | undefined;
      return {
        url: item.url,
        verdict: (indexStatus?.verdict as string) ?? null,
        coverageState: (indexStatus?.coverageState as string) ?? null,
        lastCrawlTime: (indexStatus?.lastCrawlTime as string) ?? null,
        pageFetchState: (indexStatus?.pageFetchState as string) ?? null,
        error: item.error,
      };
    }),
  });
}

// ---------------------------------------------------------------------------
// serp_feature_tracking
// ---------------------------------------------------------------------------

export async function handleSerpFeatureTracking(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = SerpFeatureTrackingSchema.parse(raw);
  const { startDate, endDate } = resolveDateRange(args);

  // GSC API constraint: searchAppearance cannot be combined with other dimensions.
  // Use rolling 7-day windows to provide weekly trend data instead of daily.
  const totalDays =
    Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1;
  const windowDays = Math.min(7, totalDays);
  const windows = rollingWindows(totalDays, windowDays);

  // One API call per window, each with searchAppearance dimension only
  const windowResults = await Promise.all(
    windows.map((w) =>
      service
        .searchAnalytics(args.siteUrl, {
          startDate: w.startDate,
          endDate: w.endDate,
          dimensions: ['searchAppearance'],
          rowLimit: args.rowLimit,
        })
        .then((res) => ({
          window: w,
          rows: (res.data as { rows?: SearchAnalyticsRow[] }).rows ?? [],
        })),
    ),
  );

  // Pivot: group by searchAppearance, then by window period
  const featureMap = new Map<
    string,
    Array<{
      period: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>
  >();

  for (const { window, rows } of windowResults) {
    const periodLabel = `${window.startDate}/${window.endDate}`;
    for (const row of rows) {
      const feature = row.keys?.[0] ?? 'unknown';
      if (!featureMap.has(feature)) featureMap.set(feature, []);
      featureMap.get(feature)!.push({
        period: periodLabel,
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: Number(((row.ctr ?? 0) * 100).toFixed(2)),
        position: Number((row.position ?? 0).toFixed(1)),
      });
    }
  }

  const features = Array.from(featureMap.entries())
    .map(([feature, periods]) => {
      const sorted = periods.sort((a, b) => a.period.localeCompare(b.period));
      const totalClicks = sorted.reduce((s, d) => s + d.clicks, 0);
      const totalImpressions = sorted.reduce((s, d) => s + d.impressions, 0);

      return {
        feature,
        totalClicks,
        totalImpressions,
        avgCtr:
          totalImpressions > 0
            ? Number(((totalClicks / totalImpressions) * 100).toFixed(2))
            : 0,
        periodsWithData: sorted.length,
        trend: sorted,
      };
    })
    .sort((a, b) => b.totalClicks - a.totalClicks);

  return jsonResult({
    siteUrl: args.siteUrl,
    dateRange: { startDate, endDate },
    windowDays,
    totalWindows: windows.length,
    totalFeatures: features.length,
    features,
  });
}

// ---------------------------------------------------------------------------
// cannibalization_resolver
// ---------------------------------------------------------------------------

export async function handleCannibalizationResolver(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = CannibalizationResolverSchema.parse(raw);
  const { startDate, endDate } = resolveDateRange(args);

  const response = await service.searchAnalytics(args.siteUrl, {
    startDate,
    endDate,
    dimensions: ['query', 'page'],
    rowLimit: args.rowLimit,
  });

  const rows =
    (response.data as { rows?: SearchAnalyticsRow[] }).rows ?? [];

  // Group by query
  const queryMap = new Map<
    string,
    Array<{
      page: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>
  >();

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

  // Find cannibalized queries + recommendations
  const resolved = Array.from(queryMap.entries())
    .filter(([, pages]) => pages.length >= 2)
    .map(([query, pages]) => {
      const totalImpressions = pages.reduce((s, p) => s + p.impressions, 0);
      if (totalImpressions < args.minImpressions) return null;

      const positions = pages.map((p) => p.position);
      const avgPos = positions.reduce((s, p) => s + p, 0) / positions.length;
      const variance =
        positions.reduce((s, p) => s + Math.pow(p - avgPos, 2), 0) /
        positions.length;

      // Sort: most clicks first, then best position (lower = better)
      const sorted = [...pages].sort((a, b) => {
        if (b.clicks !== a.clicks) return b.clicks - a.clicks;
        return a.position - b.position;
      });

      const winner = sorted[0];
      const losers = sorted.slice(1);

      let recommendation: Record<string, unknown> | undefined;
      if (args.includeRecommendation) {
        recommendation = {
          winnerUrl: winner.page,
          winnerClicks: winner.clicks,
          winnerPosition: Number(winner.position.toFixed(1)),
          actions: losers.map((loser) => {
            const clickRatio =
              winner.clicks > 0 ? loser.clicks / winner.clicks : 0;
            const posGap = loser.position - winner.position;

            let action: string;
            if (clickRatio < 0.1 && posGap > 5) {
              action = 'redirect';
            } else if (clickRatio < 0.3) {
              action = 'consolidate';
            } else {
              action = 'differentiate';
            }

            return {
              url: loser.page,
              clicks: loser.clicks,
              position: Number(loser.position.toFixed(1)),
              action,
              rationale:
                action === 'redirect'
                  ? `Low traffic (${loser.clicks} clicks) and poor position (${loser.position.toFixed(1)}). 301 redirect to winner.`
                  : action === 'consolidate'
                    ? `Moderate traffic (${loser.clicks} clicks). Merge unique content into winner, then redirect.`
                    : `Significant traffic (${loser.clicks} clicks). Differentiate targeting — adjust title/content to serve a distinct intent.`,
            };
          }),
        };
      }

      return {
        query,
        pageCount: pages.length,
        totalImpressions,
        positionVariance: Number(variance.toFixed(2)),
        pages: sorted.map((p) => ({
          ...p,
          ctr: Number(p.ctr.toFixed(2)),
          position: Number(p.position.toFixed(1)),
        })),
        ...(recommendation ? { recommendation } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.totalImpressions - a.totalImpressions);

  return jsonResult({
    siteUrl: args.siteUrl,
    dateRange: { startDate, endDate },
    cannibalizationIssues: resolved.length,
    queries: resolved,
  });
}

// ---------------------------------------------------------------------------
// drop_alerts
// ---------------------------------------------------------------------------

export async function handleDropAlerts(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = DropAlertsSchema.parse(raw);
  const { periodA, periodB } = comparePeriods(args.days);

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

  const recent =
    (resRecent.data as { rows?: SearchAnalyticsRow[] }).rows ?? [];
  const prior =
    (resPrior.data as { rows?: SearchAnalyticsRow[] }).rows ?? [];

  const recentMap = new Map<string, SearchAnalyticsRow>();
  for (const row of recent) recentMap.set(row.keys?.[0] ?? '', row);

  const alerts = prior
    .filter((row) => (row.clicks ?? 0) >= args.minClicks)
    .map((priorRow) => {
      const page = priorRow.keys?.[0] ?? '';
      const recentRow = recentMap.get(page);
      const clicksPrior = priorRow.clicks ?? 0;
      const clicksRecent = recentRow?.clicks ?? 0;
      const clicksLost = clicksPrior - clicksRecent;
      const dropPct =
        clicksPrior > 0
          ? Number(
              (((clicksPrior - clicksRecent) / clicksPrior) * 100).toFixed(1),
            )
          : 0;

      return {
        page,
        clicksPrior,
        clicksRecent,
        clicksLost,
        dropPct,
        impressionsPrior: priorRow.impressions ?? 0,
        impressionsRecent: recentRow?.impressions ?? 0,
        positionPrior: Number((priorRow.position ?? 0).toFixed(1)),
        positionRecent: recentRow ? Number((recentRow.position ?? 0).toFixed(1)) : null,
      };
    })
    .filter((d) => d.dropPct >= args.threshold)
    .sort((a, b) => b.clicksLost - a.clicksLost);

  return jsonResult({
    siteUrl: args.siteUrl,
    recentPeriod: periodA,
    priorPeriod: periodB,
    threshold: args.threshold,
    minClicks: args.minClicks,
    alertCount: alerts.length,
    totalClicksLost: alerts.reduce((s, a) => s + a.clicksLost, 0),
    alerts,
  });
}
