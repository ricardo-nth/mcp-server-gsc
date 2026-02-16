import { SearchConsoleService } from '../service.js';
import {
  SearchAnalyticsSchema,
  EnhancedSearchAnalyticsSchema,
  QuickWinsSchema,
} from '../schemas/analytics.js';
import { resolveDateRange } from '../utils/dates.js';
import { jsonResult, type ToolResult, type SearchAnalyticsRow } from '../utils/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build dimensionFilterGroups from the flat filter params */
function buildFilters(args: {
  pageFilter?: string;
  queryFilter?: string;
  countryFilter?: string;
  deviceFilter?: string;
  filterOperator?: string;
}) {
  const filters: Array<{
    dimension: string;
    operator: string;
    expression: string;
  }> = [];

  if (args.pageFilter) {
    filters.push({
      dimension: 'page',
      operator: args.filterOperator ?? 'equals',
      expression: args.pageFilter,
    });
  }
  if (args.queryFilter) {
    filters.push({
      dimension: 'query',
      operator: args.filterOperator ?? 'equals',
      expression: args.queryFilter,
    });
  }
  if (args.countryFilter) {
    filters.push({
      dimension: 'country',
      operator: 'equals',
      expression: args.countryFilter,
    });
  }
  if (args.deviceFilter) {
    filters.push({
      dimension: 'device',
      operator: 'equals',
      expression: args.deviceFilter,
    });
  }

  return filters.length > 0
    ? [{ groupType: 'and' as const, filters }]
    : undefined;
}

/** Detect quick-win opportunities from analytics rows */
function detectQuickWins(
  rows: SearchAnalyticsRow[],
  thresholds: {
    minImpressions?: number;
    maxCtr?: number;
    positionRangeMin?: number;
    positionRangeMax?: number;
  } = {},
) {
  const {
    minImpressions = 50,
    maxCtr = 2.0,
    positionRangeMin = 4,
    positionRangeMax = 10,
  } = thresholds;

  return rows
    .filter((row) => {
      const impressions = row.impressions ?? 0;
      const ctr = (row.ctr ?? 0) * 100;
      const position = row.position ?? 0;
      return (
        impressions >= minImpressions &&
        ctr <= maxCtr &&
        position >= positionRangeMin &&
        position <= positionRangeMax
      );
    })
    .map((row) => {
      const impressions = row.impressions ?? 0;
      const currentClicks = row.clicks ?? 0;
      const currentCtr = (row.ctr ?? 0) * 100;
      const position = row.position ?? 0;
      const targetCtr = 5.0;
      const potentialClicks = Math.round((impressions * targetCtr) / 100);
      const additionalClicks = Math.max(0, potentialClicks - currentClicks);

      return {
        query: row.keys?.[0] ?? 'N/A',
        page: row.keys?.[1] ?? 'N/A',
        currentPosition: Number(position.toFixed(1)),
        impressions,
        currentClicks,
        currentCtr: Number(currentCtr.toFixed(2)),
        potentialClicks,
        additionalClicks,
        opportunity: additionalClicks > 0 ? 'High' : 'Low',
      };
    })
    .sort((a, b) => b.additionalClicks - a.additionalClicks);
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

export async function handleListSites(
  service: SearchConsoleService,
): Promise<ToolResult> {
  const response = await service.listSites();
  return jsonResult(response.data);
}

export async function handleSearchAnalytics(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = SearchAnalyticsSchema.parse(raw);
  const { startDate, endDate } = resolveDateRange(args);

  const body: Record<string, unknown> = {
    startDate,
    endDate,
    dimensions: args.dimensions,
    searchType: args.type,
    aggregationType: args.aggregationType,
    dataState: args.dataState,
    rowLimit: args.rowLimit,
    startRow: args.startRow,
  };

  const filterGroups = buildFilters(args);
  if (filterGroups) body.dimensionFilterGroups = filterGroups;

  const response = await service.searchAnalytics(args.siteUrl, body);
  return jsonResult(response.data);
}

export async function handleEnhancedSearchAnalytics(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = EnhancedSearchAnalyticsSchema.parse(raw);
  const { startDate, endDate } = resolveDateRange(args);

  const body: Record<string, unknown> = {
    startDate,
    endDate,
    dimensions: args.dimensions,
    searchType: args.type,
    aggregationType: args.aggregationType,
    dataState: args.dataState,
    rowLimit: args.rowLimit,
    startRow: args.startRow,
  };

  // Build base filters
  const filterGroups = buildFilters(args) ?? [];

  // Add regex filter if provided
  if (args.regexFilter && args.dimensions?.includes('query')) {
    filterGroups.push({
      groupType: 'and',
      filters: [
        {
          dimension: 'query',
          operator: 'includingRegex',
          expression: args.regexFilter,
        },
      ],
    });
  }

  if (filterGroups.length > 0) body.dimensionFilterGroups = filterGroups;

  const response = await service.searchAnalytics(args.siteUrl, body);
  const data = response.data as { rows?: SearchAnalyticsRow[] };

  // Attach quick-wins if requested
  if (args.enableQuickWins && data.rows) {
    const quickWins = detectQuickWins(data.rows, args.quickWinsThresholds);
    return jsonResult({
      ...data,
      quickWins,
      enhancedFeatures: {
        regexFilterApplied: !!args.regexFilter,
        quickWinsEnabled: true,
        rowLimit: args.rowLimit,
      },
    });
  }

  return jsonResult(data);
}

export async function handleDetectQuickWins(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = QuickWinsSchema.parse(raw);
  const { startDate, endDate } = resolveDateRange(args);

  const body: Record<string, unknown> = {
    startDate,
    endDate,
    dimensions: ['query', 'page'],
    rowLimit: 25000,
  };

  const response = await service.searchAnalytics(args.siteUrl, body);
  const data = response.data as { rows?: SearchAnalyticsRow[] };

  if (!data.rows) {
    return jsonResult({ message: 'No data available for quick wins analysis' });
  }

  const quickWins = detectQuickWins(data.rows, {
    minImpressions: args.minImpressions,
    maxCtr: args.maxCtr,
    positionRangeMin: args.positionRangeMin,
    positionRangeMax: args.positionRangeMax,
  });

  return jsonResult({
    quickWins,
    totalOpportunities: quickWins.length,
    thresholds: {
      minImpressions: args.minImpressions,
      maxCtr: args.maxCtr,
      positionRangeMin: args.positionRangeMin,
      positionRangeMax: args.positionRangeMax,
    },
  });
}
