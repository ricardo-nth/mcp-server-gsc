import { SearchConsoleService } from '../service.js';
import { RunSeoAuditWorkflowSchema } from '../schemas/workflow.js';
import { resolveDateRange } from '../utils/dates.js';
import { detectBrandSegment } from '../utils/seo-analysis.js';
import { jsonResult, type SearchAnalyticsRow, type ToolResult } from '../utils/types.js';
import { handleRecommendNextActions } from './recommendations.js';
import { handleDetectQuickWins } from './analytics.js';
import { handleContentDecay } from './computed.js';
import {
  handlePageHealthDashboard,
  handleIndexingHealthReport,
  handleDropAlerts,
} from './computed2.js';

type WorkflowArgs = ReturnType<typeof RunSeoAuditWorkflowSchema.parse>;
type WorkflowReportFormat = NonNullable<WorkflowArgs['reportFormat']> | 'json';
type WorkflowDetailMode = WorkflowArgs['detailMode'];
type WorkflowReportPack = NonNullable<WorkflowArgs['reportPack']>;
type WorkflowBrand = WorkflowArgs['brand'];

interface WorkflowStepResult {
  step: string;
  status: 'success' | 'error';
  data?: unknown;
  error?: string;
}

interface WorkflowExecutiveSummary {
  overallStatus: 'healthy' | 'partial' | 'failed';
  stepsSucceeded: number;
  stepsFailed: number;
  keyActions: string[];
}

type WorkflowSeverity = 'low' | 'medium' | 'high';
type WorkflowImpact = 'low' | 'medium' | 'high';
type WorkflowEffort = 'low' | 'medium' | 'high';
type WorkflowOwner = 'seo_analyst' | 'seo_engineering' | 'content' | 'web_performance';

interface WorkflowIssue {
  sourceStep: string;
  title: string;
  severity: WorkflowSeverity;
  impact: WorkflowImpact;
  effort: WorkflowEffort;
  owner: WorkflowOwner;
  clientSummary: string;
  analystDetail?: string;
}

interface WorkflowActionItem {
  sourceStep: string;
  action: string;
  impact: WorkflowImpact;
  effort: WorkflowEffort;
  owner: WorkflowOwner;
  clientSummary: string;
  analystDetail?: string;
}

interface WorkflowReport {
  meta: {
    title: string;
    generatedAt: string;
    format: WorkflowReportFormat;
    detailMode: WorkflowDetailMode;
    reportPack: WorkflowReportPack | null;
    brand: WorkflowBrand | null;
  };
  pack: {
    name: WorkflowReportPack | null;
    headline: string;
    summary: string;
    cadence: 'monthly' | 'ad_hoc';
    primaryAudience: 'client' | 'analyst' | 'both';
  };
  site: {
    siteUrl: string;
    profile: WorkflowArgs['profile'];
    dateRange: { startDate: string; endDate: string };
  };
  executiveSummary: WorkflowExecutiveSummary;
  audience: {
    detailMode: WorkflowDetailMode;
    clientSummary: string[];
    analystSummary?: string[];
  };
  issues: WorkflowIssue[];
  actions: WorkflowActionItem[];
  sections: {
    drilldown: WorkflowStepResult[];
    monthlySeo?: WorkflowMonthlyReportSection;
  };
}

interface WorkflowMonthlyMetric {
  label: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
  deltaPctContext: 'standard' | 'from_zero' | 'no_prior_baseline';
  direction: 'up' | 'down' | 'flat';
  format: 'number' | 'percent';
}

interface WorkflowMonthlyComparisonRow {
  label: string;
  currentClicks: number;
  previousClicks: number;
  clicksDelta: number;
  currentImpressions: number;
  previousImpressions: number;
  impressionsDelta: number;
  currentCtr: number;
  previousCtr: number;
  ctrDelta: number;
  currentPosition: number;
  previousPosition: number;
  positionDelta: number;
  brandSegment?: 'branded' | 'non_branded';
}

interface WorkflowMonthlyBrandSegment {
  segment: 'branded' | 'non_branded';
  currentClicks: number;
  previousClicks: number;
  clicksDelta: number;
  currentImpressions: number;
  previousImpressions: number;
  impressionsDelta: number;
  currentCtr: number;
  previousCtr: number;
  ctrDelta: number;
}

interface WorkflowMonthlyPriority {
  action: string;
  owner: WorkflowOwner;
  impact: WorkflowImpact;
  clientSummary: string;
}

interface WorkflowMonthlyAppendixStep {
  step: string;
  status: WorkflowStepResult['status'];
  summary: string;
}

interface WorkflowMonthlyAppendix {
  clientSummary: string[];
  analystSummary?: string[];
  issues: WorkflowIssue[];
  actions: WorkflowActionItem[];
  steps: WorkflowMonthlyAppendixStep[];
}

interface WorkflowMonthlyReportSection {
  comparison: {
    current: { startDate: string; endDate: string };
    previous: { startDate: string; endDate: string };
  };
  kpiSummary: WorkflowMonthlyMetric[];
  narrative: Array<{
    tone: 'positive' | 'neutral' | 'watchout';
    text: string;
  }>;
  visibilityWins: {
    queries: WorkflowMonthlyComparisonRow[];
    pages: WorkflowMonthlyComparisonRow[];
  };
  popularSearches: {
    topQueries: WorkflowMonthlyComparisonRow[];
    risingQueries: WorkflowMonthlyComparisonRow[];
  };
  topPages: {
    topPages: WorkflowMonthlyComparisonRow[];
    improvingPages: WorkflowMonthlyComparisonRow[];
  };
  brandPerformance: WorkflowMonthlyBrandSegment[];
  nextMonthPriorities: WorkflowMonthlyPriority[];
  analystAppendix: WorkflowMonthlyAppendix;
  note?: string;
}

function unwrapResult(result: ToolResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = result.content[0]?.text;
  return text ? (JSON.parse(text) as unknown) : {};
}

async function runStep(step: string, operation: () => Promise<ToolResult>): Promise<WorkflowStepResult> {
  try {
    const result = await operation();
    return {
      step,
      status: result.isError ? 'error' : 'success',
      ...(result.isError
        ? { error: (unwrapResult(result) as Record<string, unknown>)?.error as string }
        : { data: unwrapResult(result) }),
    };
  } catch (error) {
    return {
      step,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function getReportPackConfig(
  profile: WorkflowArgs['profile'],
  reportPack?: WorkflowReportPack,
): WorkflowReport['pack'] {
  if (reportPack === 'monthly_seo') {
    return {
      name: reportPack,
      headline: 'Monthly SEO update pack',
      summary:
        'Summarizes recent search performance movement, opportunity areas, and the clearest follow-up actions for recurring client reporting.',
      cadence: 'monthly',
      primaryAudience: 'client',
    };
  }
  if (reportPack === 'technical_audit') {
    return {
      name: reportPack,
      headline: 'Technical audit pack',
      summary:
        'Frames the workflow around indexing, site health, and technical risks so teams can move from diagnosis into fixes quickly.',
      cadence: 'ad_hoc',
      primaryAudience: 'both',
    };
  }
  if (reportPack === 'indexing_recovery') {
    return {
      name: reportPack,
      headline: 'Indexing recovery pack',
      summary:
        'Packages indexing-specific findings into a recovery-oriented handoff with emphasis on non-indexed URLs and remediation sequencing.',
      cadence: 'ad_hoc',
      primaryAudience: 'both',
    };
  }
  if (reportPack === 'content_opportunities') {
    return {
      name: reportPack,
      headline: 'Content opportunity pack',
      summary:
        'Highlights quick wins, decay trends, and prioritized content actions that can unlock the next tranche of organic growth.',
      cadence: 'ad_hoc',
      primaryAudience: 'analyst',
    };
  }

  if (profile === 'technical') {
    return {
      name: null,
      headline: 'Technical workflow report',
      summary: 'Standard technical workflow handoff without a report-pack preset.',
      cadence: 'ad_hoc',
      primaryAudience: 'both',
    };
  }
  if (profile === 'content') {
    return {
      name: null,
      headline: 'Content workflow report',
      summary: 'Standard content workflow handoff without a report-pack preset.',
      cadence: 'ad_hoc',
      primaryAudience: 'both',
    };
  }
  return {
    name: null,
    headline: 'Indexing workflow report',
    summary: 'Standard indexing workflow handoff without a report-pack preset.',
    cadence: 'ad_hoc',
    primaryAudience: 'both',
  };
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const next = parseIsoDate(value);
  next.setUTCDate(next.getUTCDate() + days);
  return formatIsoDate(next);
}

function getPreviousDateRange(startDate: string, endDate: string): { startDate: string; endDate: string } {
  const spanDays = getDateRangeSpanDays(startDate, endDate);
  return {
    startDate: addDays(startDate, -spanDays),
    endDate: addDays(startDate, -1),
  };
}

function getDateRangeSpanDays(startDate: string, endDate: string): number {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function getPctChangeMetadata(current: number, previous: number): Pick<WorkflowMonthlyMetric, 'deltaPct' | 'deltaPctContext'> {
  if (previous === 0) {
    return {
      deltaPct: null,
      deltaPctContext: current > 0 ? 'from_zero' : 'no_prior_baseline',
    };
  }
  return {
    deltaPct: round(((current - previous) / previous) * 100),
    deltaPctContext: 'standard',
  };
}

function getDirection(delta: number): 'up' | 'down' | 'flat' {
  if (Math.abs(delta) < 0.01) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

function aggregateRows(rows: SearchAnalyticsRow[]): {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
} {
  const clicks = rows.reduce((sum, row) => sum + (row.clicks ?? 0), 0);
  const impressions = rows.reduce((sum, row) => sum + (row.impressions ?? 0), 0);
  const weightedPosition = rows.reduce(
    (sum, row) => sum + (row.position ?? 0) * Math.max(row.impressions ?? 0, 0),
    0,
  );

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? round((clicks / impressions) * 100) : 0,
    position: impressions > 0 ? round(weightedPosition / impressions, 1) : 0,
  };
}

function createMetric(
  label: string,
  format: WorkflowMonthlyMetric['format'],
  current: number,
  previous: number,
): WorkflowMonthlyMetric {
  const rawDelta = current - previous;
  const deltaPrecision = format === 'percent' ? 2 : label === 'Average Position' ? 1 : 0;
  const delta = round(rawDelta, deltaPrecision);
  const { deltaPct, deltaPctContext } = getPctChangeMetadata(current, previous);
  return {
    label,
    current,
    previous,
    delta,
    deltaPct,
    deltaPctContext,
    direction: getDirection(rawDelta),
    format,
  };
}

function mapRowsByLabel(rows: SearchAnalyticsRow[]): Map<string, SearchAnalyticsRow> {
  return new Map(
    rows
      .filter((row) => Boolean(row.keys?.[0]))
      .map((row) => [row.keys?.[0] ?? '', row]),
  );
}

function toComparisonRow(
  label: string,
  currentRow: SearchAnalyticsRow | undefined,
  previousRow: SearchAnalyticsRow | undefined,
  brandSegment?: 'branded' | 'non_branded',
): WorkflowMonthlyComparisonRow {
  const currentClicks = currentRow?.clicks ?? 0;
  const previousClicks = previousRow?.clicks ?? 0;
  const currentImpressions = currentRow?.impressions ?? 0;
  const previousImpressions = previousRow?.impressions ?? 0;
  const currentCtr = round((currentRow?.ctr ?? 0) * 100);
  const previousCtr = round((previousRow?.ctr ?? 0) * 100);
  const currentPosition = round(currentRow?.position ?? 0, 1);
  const previousPosition = round(previousRow?.position ?? 0, 1);

  return {
    label,
    currentClicks,
    previousClicks,
    clicksDelta: currentClicks - previousClicks,
    currentImpressions,
    previousImpressions,
    impressionsDelta: currentImpressions - previousImpressions,
    currentCtr,
    previousCtr,
    ctrDelta: round(currentCtr - previousCtr),
    currentPosition,
    previousPosition,
    positionDelta: round(previousPosition - currentPosition, 1),
    ...(brandSegment ? { brandSegment } : {}),
  };
}

async function fetchSearchRows(
  service: SearchConsoleService,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit: number,
): Promise<SearchAnalyticsRow[]> {
  const response = await service.searchAnalytics(siteUrl, {
    startDate,
    endDate,
    dimensions,
    rowLimit,
    dataState: 'all',
  });
  return ((response.data as { rows?: SearchAnalyticsRow[] }).rows ?? []) as SearchAnalyticsRow[];
}

function describeMonthlyMetric(metric: WorkflowMonthlyMetric): string {
  if (metric.label === 'Average Position') {
    if (metric.direction === 'flat') {
      return `Average Position held steady at ${metric.current.toFixed(1)}.`;
    }
    return `Average Position ${metric.direction === 'down' ? 'improved' : 'softened'} to ${metric.current.toFixed(1)} (${formatMonthlyDelta(metric)}).`;
  }
  const deltaText =
    metric.deltaPctContext === 'from_zero'
      ? 'from zero'
      : metric.deltaPctContext === 'no_prior_baseline' || metric.deltaPct === null
        ? 'with no prior baseline'
        : `${metric.deltaPct > 0 ? '+' : ''}${metric.deltaPct}% vs previous period`;
  return `${metric.label} ${metric.direction === 'flat' ? 'held steady' : metric.direction === 'up' ? 'moved up' : 'moved down'} to ${metric.current}${metric.format === 'percent' ? '%' : ''} ${deltaText}`.trim();
}

function getStepSummary(step: WorkflowStepResult): string {
  if (step.status === 'error') {
    return summarizeError(step.error ?? 'Unknown workflow error');
  }

  const data = (step.data ?? {}) as Record<string, unknown>;
  if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
    return `${data.recommendations.length} prioritized recommendation${data.recommendations.length === 1 ? '' : 's'} generated.`;
  }
  if (typeof data.decayingPages === 'number') {
    return `${data.decayingPages} decaying page${data.decayingPages === 1 ? '' : 's'} identified.`;
  }
  if (typeof data.totalOpportunities === 'number') {
    return `${data.totalOpportunities} quick-win opportunit${data.totalOpportunities === 1 ? 'y' : 'ies'} identified.`;
  }
  if (typeof data.alertCount === 'number') {
    return `${data.alertCount} alert${data.alertCount === 1 ? '' : 's'} detected.`;
  }
  if (typeof data.notIndexed === 'number') {
    return `${data.notIndexed} non-indexed URL${data.notIndexed === 1 ? '' : 's'} detected.`;
  }
  return 'Workflow step completed successfully.';
}

function buildMonthlyAnalystAppendix(report: WorkflowReport): WorkflowMonthlyAppendix {
  return {
    clientSummary: report.audience.clientSummary,
    ...(report.audience.analystSummary ? { analystSummary: report.audience.analystSummary } : {}),
    issues: report.issues,
    actions: report.actions,
    steps: report.sections.drilldown.map((step) => ({
      step: step.step,
      status: step.status,
      summary: getStepSummary(step),
    })),
  };
}

function buildMonthlySeoFallbackSection(
  report: WorkflowReport,
  note: string,
): WorkflowMonthlyReportSection {
  const currentRange = report.site.dateRange;
  const previousRange = getPreviousDateRange(currentRange.startDate, currentRange.endDate);

  return {
    comparison: {
      current: currentRange,
      previous: previousRange,
    },
    kpiSummary: [],
    narrative: [],
    visibilityWins: {
      queries: [],
      pages: [],
    },
    popularSearches: {
      topQueries: [],
      risingQueries: [],
    },
    topPages: {
      topPages: [],
      improvingPages: [],
    },
    brandPerformance: [],
    nextMonthPriorities: [],
    analystAppendix: buildMonthlyAnalystAppendix(report),
    note,
  };
}

async function buildMonthlySeoReportSection(
  service: SearchConsoleService,
  args: WorkflowArgs,
  report: WorkflowReport,
  steps: WorkflowStepResult[],
): Promise<WorkflowMonthlyReportSection> {
  const currentRange = report.site.dateRange;
  const previousRange = getPreviousDateRange(currentRange.startDate, currentRange.endDate);
  const rowLimit = Math.max(args.rowLimit, 50);
  const dailyRowLimit = Math.max(
    getDateRangeSpanDays(currentRange.startDate, currentRange.endDate),
    getDateRangeSpanDays(previousRange.startDate, previousRange.endDate),
  );

  const [
    currentDaily,
    previousDaily,
    currentQueries,
    previousQueries,
    currentPages,
    previousPages,
  ] = await Promise.all([
    fetchSearchRows(service, args.siteUrl, currentRange.startDate, currentRange.endDate, ['date'], dailyRowLimit),
    fetchSearchRows(service, args.siteUrl, previousRange.startDate, previousRange.endDate, ['date'], dailyRowLimit),
    fetchSearchRows(service, args.siteUrl, currentRange.startDate, currentRange.endDate, ['query'], rowLimit),
    fetchSearchRows(service, args.siteUrl, previousRange.startDate, previousRange.endDate, ['query'], rowLimit),
    fetchSearchRows(service, args.siteUrl, currentRange.startDate, currentRange.endDate, ['page'], rowLimit),
    fetchSearchRows(service, args.siteUrl, previousRange.startDate, previousRange.endDate, ['page'], rowLimit),
  ]);

  const currentTotals = aggregateRows(currentDaily);
  const previousTotals = aggregateRows(previousDaily);
  const currentQueryMap = mapRowsByLabel(currentQueries);
  const previousQueryMap = mapRowsByLabel(previousQueries);
  const currentPageMap = mapRowsByLabel(currentPages);
  const previousPageMap = mapRowsByLabel(previousPages);

  const brandTerms =
    ((steps.find((step) => step.step === 'recommend_next_actions')?.data as Record<string, unknown> | undefined)
      ?.brandTermsUsed as string[] | undefined) ?? [];

  const queryRows = Array.from(new Set([...currentQueryMap.keys(), ...previousQueryMap.keys()]))
    .map((query) =>
      toComparisonRow(
        query,
        currentQueryMap.get(query),
        previousQueryMap.get(query),
        detectBrandSegment(query, brandTerms),
      ),
    )
    .filter((row) => row.currentImpressions > 0 || row.previousImpressions > 0);

  const pageRows = Array.from(new Set([...currentPageMap.keys(), ...previousPageMap.keys()]))
    .map((page) => toComparisonRow(page, currentPageMap.get(page), previousPageMap.get(page)))
    .filter((row) => row.currentImpressions > 0 || row.previousImpressions > 0);

  const kpiSummary = [
    createMetric('Clicks', 'number', currentTotals.clicks, previousTotals.clicks),
    createMetric('Impressions', 'number', currentTotals.impressions, previousTotals.impressions),
    createMetric('CTR', 'percent', currentTotals.ctr, previousTotals.ctr),
    createMetric('Average Position', 'number', currentTotals.position, previousTotals.position),
  ];

  const topQueryWinner = [...queryRows]
    .sort((a, b) => b.clicksDelta - a.clicksDelta || b.impressionsDelta - a.impressionsDelta)
    .find((row) => row.clicksDelta > 0 || row.impressionsDelta > 0);
  const topPageWinner = [...pageRows]
    .sort((a, b) => b.clicksDelta - a.clicksDelta || b.impressionsDelta - a.impressionsDelta)
    .find((row) => row.clicksDelta > 0 || row.impressionsDelta > 0);
  const biggestDecline = [...pageRows]
    .sort((a, b) => a.clicksDelta - b.clicksDelta || a.impressionsDelta - b.impressionsDelta)
    .find((row) => row.clicksDelta < 0 || row.impressionsDelta < 0);

  const narrative: WorkflowMonthlyReportSection['narrative'] = [
    {
      tone:
        kpiSummary[0].direction === 'down' && kpiSummary[1].direction === 'down'
          ? ('watchout' as const)
          : ('positive' as const),
      text: describeMonthlyMetric(kpiSummary[0]),
    },
    {
      tone: kpiSummary[2].direction === 'down' ? ('watchout' as const) : ('neutral' as const),
      text: describeMonthlyMetric(kpiSummary[2]),
    },
    ...(topQueryWinner
      ? [
          {
            tone: 'positive' as const,
            text: `Top search momentum came from "${topQueryWinner.label}", which gained ${topQueryWinner.clicksDelta} clicks and ${topQueryWinner.impressionsDelta} impressions period over period.`,
          },
        ]
      : []),
    ...(topPageWinner
      ? [
          {
            tone: 'positive' as const,
            text: `The strongest page-level gain came from ${topPageWinner.label}, which improved by ${topPageWinner.clicksDelta} clicks and ${topPageWinner.impressionsDelta} impressions.`,
          },
        ]
      : []),
    ...(biggestDecline
      ? [
          {
            tone: 'watchout' as const,
            text: `${biggestDecline.label} softened versus the previous period and should be reviewed if that trend continues.`,
          },
        ]
      : []),
  ].slice(0, 5);

  const brandPerformance: WorkflowMonthlyBrandSegment[] =
    queryRows.length === 0
      ? []
      : (['branded', 'non_branded'] as const).map((segment) => {
          const currentSegmentRows = queryRows.filter((row) => row.brandSegment === segment);
          const previousSegmentRows = currentSegmentRows.map((row) => ({
            clicks: row.previousClicks,
            impressions: row.previousImpressions,
            ctr: row.previousImpressions > 0 ? row.previousClicks / row.previousImpressions : 0,
            position: row.previousPosition,
            keys: [row.label],
          })) as SearchAnalyticsRow[];
          const currentSegmentTotals = aggregateRows(
            currentSegmentRows.map((row) => ({
              clicks: row.currentClicks,
              impressions: row.currentImpressions,
              ctr: row.currentImpressions > 0 ? row.currentClicks / row.currentImpressions : 0,
              position: row.currentPosition,
              keys: [row.label],
            })) as SearchAnalyticsRow[],
          );
          const previousSegmentTotals = aggregateRows(previousSegmentRows);
          return {
            segment,
            currentClicks: currentSegmentTotals.clicks,
            previousClicks: previousSegmentTotals.clicks,
            clicksDelta: currentSegmentTotals.clicks - previousSegmentTotals.clicks,
            currentImpressions: currentSegmentTotals.impressions,
            previousImpressions: previousSegmentTotals.impressions,
            impressionsDelta: currentSegmentTotals.impressions - previousSegmentTotals.impressions,
            currentCtr: currentSegmentTotals.ctr,
            previousCtr: previousSegmentTotals.ctr,
            ctrDelta: round(currentSegmentTotals.ctr - previousSegmentTotals.ctr),
          };
        });

  const nextMonthPriorities = report.actions.slice(0, 5).map((action) => ({
    action: action.action,
    owner: action.owner,
    impact: action.impact,
    clientSummary: action.clientSummary,
  }));

  return {
    comparison: {
      current: currentRange,
      previous: previousRange,
    },
    kpiSummary,
    narrative,
    visibilityWins: {
      queries: [...queryRows]
        .filter((row) => row.clicksDelta > 0 || row.impressionsDelta > 0)
        .sort((a, b) => b.clicksDelta - a.clicksDelta || b.impressionsDelta - a.impressionsDelta)
        .slice(0, 5),
      pages: [...pageRows]
        .filter((row) => row.clicksDelta > 0 || row.impressionsDelta > 0)
        .sort((a, b) => b.clicksDelta - a.clicksDelta || b.impressionsDelta - a.impressionsDelta)
        .slice(0, 5),
    },
    popularSearches: {
      topQueries: [...queryRows]
        .sort((a, b) => b.currentClicks - a.currentClicks || b.currentImpressions - a.currentImpressions)
        .slice(0, 10),
      risingQueries: [...queryRows]
        .filter((row) => row.clicksDelta > 0 || row.impressionsDelta > 0)
        .sort((a, b) => b.clicksDelta - a.clicksDelta || b.impressionsDelta - a.impressionsDelta)
        .slice(0, 5),
    },
    topPages: {
      topPages: [...pageRows]
        .sort((a, b) => b.currentClicks - a.currentClicks || b.currentImpressions - a.currentImpressions)
        .slice(0, 10),
      improvingPages: [...pageRows]
        .filter((row) => row.clicksDelta > 0 || row.impressionsDelta > 0)
        .sort((a, b) => b.clicksDelta - a.clicksDelta || b.impressionsDelta - a.impressionsDelta)
        .slice(0, 5),
    },
    brandPerformance,
    nextMonthPriorities,
    analystAppendix: buildMonthlyAnalystAppendix(report),
  };
}

function mapImpact(value: unknown): WorkflowImpact {
  return value === 'high' || value === 'medium' ? value : 'low';
}

function summarizeError(error: string): string {
  if (error.includes('Number must be greater than or equal to 14')) {
    return 'The requested workflow window was too short for one of the comparison steps.';
  }
  return 'One workflow step failed and needs analyst follow-up.';
}

function getReportStepError(error: string | undefined, detailMode: WorkflowDetailMode): string {
  const message = error ?? 'Unknown workflow error';
  return detailMode === 'client' ? summarizeError(message) : message;
}

function buildProfessionalOutputs(
  steps: WorkflowStepResult[],
  detailMode: WorkflowDetailMode,
): {
  issues: WorkflowIssue[];
  actions: WorkflowActionItem[];
  clientSummary: string[];
  analystSummary?: string[];
} {
  const issues: WorkflowIssue[] = [];
  const actions: WorkflowActionItem[] = [];
  const analystSummary: string[] = [];

  for (const step of steps) {
    const data = (step.data ?? {}) as Record<string, unknown>;

    if (step.status === 'error') {
      issues.push({
        sourceStep: step.step,
        title: `${step.step} needs follow-up`,
        severity: step.step === 'indexing_health_report' ? 'high' : 'medium',
        impact: step.step === 'indexing_health_report' ? 'high' : 'medium',
        effort: 'medium',
        owner: step.step === 'page_health_dashboard' ? 'web_performance' : 'seo_engineering',
        clientSummary: summarizeError(step.error ?? 'Unknown workflow error'),
        ...(detailMode !== 'client' ? { analystDetail: step.error ?? 'Unknown workflow error' } : {}),
      });
      analystSummary.push(`${step.step} failed with: ${step.error ?? 'Unknown workflow error'}`);
      continue;
    }

    if (typeof data.notIndexed === 'number' && data.notIndexed > 0) {
      issues.push({
        sourceStep: step.step,
        title: `${data.notIndexed} URLs are not indexed`,
        severity: data.notIndexed >= 10 ? 'high' : 'medium',
        impact: 'high',
        effort: 'medium',
        owner: 'seo_engineering',
        clientSummary: `${data.notIndexed} URLs need indexing remediation before they can contribute to organic visibility.`,
        ...(detailMode !== 'client'
          ? { analystDetail: `Indexing workflow reported ${data.notIndexed} non-indexed URLs.` }
          : {}),
      });
      actions.push({
        sourceStep: step.step,
        action: `Prioritize indexing remediation for ${data.notIndexed} URLs`,
        impact: 'high',
        effort: 'medium',
        owner: 'seo_engineering',
        clientSummary: 'Address the non-indexed URL set first to recover crawl and visibility coverage.',
        ...(detailMode !== 'client'
          ? { analystDetail: `Use indexing_health_report drilldown to review coverage states and errors.` }
          : {}),
      });
    }

    if (typeof data.alertCount === 'number' && data.alertCount > 0) {
      issues.push({
        sourceStep: step.step,
        title: `${data.alertCount} traffic drop alerts detected`,
        severity: data.alertCount >= 5 ? 'high' : 'medium',
        impact: 'high',
        effort: 'medium',
        owner: 'seo_analyst',
        clientSummary: `${data.alertCount} pages showed meaningful traffic declines and should be reviewed for changes or losses in search demand.`,
        ...(detailMode !== 'client'
          ? { analystDetail: `Drop alert threshold triggered for ${data.alertCount} pages.` }
          : {}),
      });
    }

    if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
      const recommendations = data.recommendations as Array<Record<string, unknown>>;
      for (const recommendation of recommendations.slice(0, 3)) {
        const type = String(recommendation.type ?? '');
        const owner: WorkflowOwner =
          type === 'cwv_improvement'
            ? 'web_performance'
            : type === 'ctr_optimization'
              ? 'content'
              : 'seo_engineering';
        const effort: WorkflowEffort =
          type === 'ctr_optimization' ? 'low' : type === 'cwv_improvement' ? 'medium' : 'high';
        actions.push({
          sourceStep: step.step,
          action: String(recommendation.action ?? 'Review recommendation'),
          impact: mapImpact(recommendation.impact),
          effort,
          owner,
          clientSummary: `Recommended next step: ${String(recommendation.action ?? 'Review recommendation')}.`,
          ...(detailMode !== 'client'
            ? {
                analystDetail: Array.isArray(recommendation.rationale)
                  ? (recommendation.rationale as string[]).join(' ')
                  : undefined,
              }
            : {}),
        });
      }
    }
  }

  const clientSummary = [
    issues.length > 0
      ? `${issues.length} issue${issues.length === 1 ? ' requires' : 's require'} attention in this workflow handoff.`
      : 'No critical workflow issues were detected in this handoff.',
    actions.length > 0
      ? `${actions.length} prioritized action${actions.length === 1 ? ' was' : 's were'} generated for follow-up.`
      : 'No prioritized actions were generated from this run.',
  ];

  return {
    issues,
    actions,
    clientSummary,
    ...(detailMode !== 'client' && analystSummary.length > 0 ? { analystSummary } : {}),
  };
}

function getReportTitle(profile: WorkflowArgs['profile'], reportPack?: WorkflowReportPack): string {
  if (reportPack === 'monthly_seo') return 'Monthly SEO Workflow Report';
  if (reportPack === 'technical_audit') return 'Technical SEO Workflow Report';
  if (reportPack === 'indexing_recovery') return 'Indexing Recovery Workflow Report';
  if (reportPack === 'content_opportunities') return 'Content Opportunity Workflow Report';
  if (profile === 'technical') return 'Technical SEO Workflow Report';
  if (profile === 'content') return 'Content Performance Workflow Report';
  return 'Indexing Recovery Workflow Report';
}

function resolveReportFormat(args: WorkflowArgs): WorkflowReportFormat {
  return args.reportFormat ?? (args.markdown ? 'markdown' : 'json');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildListItems(items: string[]): string {
  if (items.length === 0) {
    return '<p class="empty-state">No immediate actions identified.</p>';
  }

  return `<ul>${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')}</ul>`;
}

function formatMonthlyMetricValue(metric: WorkflowMonthlyMetric): string {
  if (metric.label === 'Average Position') {
    return metric.current.toFixed(1);
  }
  if (metric.format === 'percent') {
    return `${metric.current.toFixed(2)}%`;
  }
  return metric.current.toLocaleString('en-US');
}

function formatMonthlyDelta(metric: WorkflowMonthlyMetric): string {
  const deltaValue =
    metric.format === 'percent' || metric.label === 'Average Position'
      ? metric.delta.toFixed(metric.label === 'Average Position' ? 1 : 2)
      : metric.delta.toLocaleString('en-US');
  const deltaPrefix = metric.delta > 0 ? '+' : '';
  const pctText =
    metric.deltaPctContext === 'from_zero'
      ? 'from zero'
      : metric.deltaPctContext === 'no_prior_baseline' || metric.deltaPct === null
        ? 'no prior baseline'
        : `${metric.deltaPct > 0 ? '+' : ''}${metric.deltaPct}%`;
  return `${deltaPrefix}${deltaValue}${metric.format === 'percent' ? ' pts' : ''} (${pctText})`;
}

function buildMonthlyMarkdownRows(rows: WorkflowMonthlyComparisonRow[], includeBrand = false): string[] {
  if (rows.length === 0) {
    return ['- No notable movement in this section for the selected period.'];
  }

  return rows.map((row) => {
    const brandText = includeBrand && row.brandSegment ? `; segment=${row.brandSegment}` : '';
    return `- ${row.label} [clicks=${row.currentClicks}; clicksDelta=${row.clicksDelta}; impressions=${row.currentImpressions}; impressionsDelta=${row.impressionsDelta}; position=${row.currentPosition}; positionDelta=${row.positionDelta}${brandText}]`;
  });
}

function buildMonthlyHtmlTable(
  title: string,
  rows: WorkflowMonthlyComparisonRow[],
  includeBrand = false,
): string {
  if (rows.length === 0) {
    return `
      <article class="table-card">
        <h3>${escapeHtml(title)}</h3>
        <p class="empty-state">No notable movement in this section for the selected period.</p>
      </article>
    `;
  }

  const brandHeader = includeBrand ? '<th>Segment</th>' : '';
  const brandCell = (row: WorkflowMonthlyComparisonRow) =>
    includeBrand ? `<td>${escapeHtml(row.brandSegment ?? 'non_branded')}</td>` : '';

  return `
    <article class="table-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Label</th>
              ${brandHeader}
              <th>Clicks</th>
              <th>Clicks Δ</th>
              <th>Impr.</th>
              <th>Impr. Δ</th>
              <th>Pos.</th>
              <th>Pos. Δ</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr>
                <td>${escapeHtml(row.label)}</td>
                ${brandCell(row)}
                <td>${row.currentClicks}</td>
                <td>${row.clicksDelta > 0 ? '+' : ''}${row.clicksDelta}</td>
                <td>${row.currentImpressions}</td>
                <td>${row.impressionsDelta > 0 ? '+' : ''}${row.impressionsDelta}</td>
                <td>${row.currentPosition.toFixed(1)}</td>
                <td>${row.positionDelta > 0 ? '+' : ''}${row.positionDelta.toFixed(1)}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function buildMonthlySeoMarkdownReport(
  report: WorkflowReport,
  monthly: WorkflowMonthlyReportSection,
): string {
  const lines: string[] = [];
  lines.push(`# ${report.meta.title}`);
  lines.push('');
  lines.push(`- Site: ${report.site.siteUrl}`);
  lines.push(`- Profile: ${report.site.profile}`);
  lines.push(`- Current Period: ${monthly.comparison.current.startDate} to ${monthly.comparison.current.endDate}`);
  lines.push(`- Previous Period: ${monthly.comparison.previous.startDate} to ${monthly.comparison.previous.endDate}`);
  lines.push(`- Report Pack: ${report.meta.reportPack ?? 'none'}`);
  lines.push(`- Brand: ${report.meta.brand?.name ?? 'N/A'}`);
  lines.push('');
  if (monthly.note) {
    lines.push('## Report Note');
    lines.push('');
    lines.push(`- ${monthly.note}`);
    lines.push('');
  }
  lines.push('## KPI Summary');
  lines.push('');
  if (monthly.kpiSummary.length === 0) {
    lines.push('- Monthly KPI summary was not available for this run.');
  } else {
    for (const metric of monthly.kpiSummary) {
      lines.push(`- ${metric.label}: ${formatMonthlyMetricValue(metric)} | ${formatMonthlyDelta(metric)}`);
    }
  }
  lines.push('');
  lines.push('## Month-over-Month Summary');
  lines.push('');
  for (const item of monthly.narrative) {
    lines.push(`- ${item.text}`);
  }
  lines.push('');
  lines.push('## Visibility Wins');
  lines.push('');
  lines.push('### Query Wins');
  lines.push(...buildMonthlyMarkdownRows(monthly.visibilityWins.queries, true));
  lines.push('');
  lines.push('### Page Wins');
  lines.push(...buildMonthlyMarkdownRows(monthly.visibilityWins.pages));
  lines.push('');
  lines.push('## Popular Searches');
  lines.push('');
  lines.push('### Top Queries');
  lines.push(...buildMonthlyMarkdownRows(monthly.popularSearches.topQueries, true));
  lines.push('');
  lines.push('### Rising Queries');
  lines.push(...buildMonthlyMarkdownRows(monthly.popularSearches.risingQueries, true));
  lines.push('');
  lines.push('## Top Pages');
  lines.push('');
  lines.push('### Best Performing Pages');
  lines.push(...buildMonthlyMarkdownRows(monthly.topPages.topPages));
  lines.push('');
  lines.push('### Improving Pages');
  lines.push(...buildMonthlyMarkdownRows(monthly.topPages.improvingPages));
  lines.push('');
  lines.push('## Brand vs Non-Brand Performance');
  lines.push('');
  if (monthly.brandPerformance.length === 0) {
    lines.push('- No brand segmentation data available for the selected period.');
  } else {
    for (const segment of monthly.brandPerformance) {
      lines.push(
        `- ${segment.segment}: clicks ${segment.currentClicks} (${segment.clicksDelta > 0 ? '+' : ''}${segment.clicksDelta}), impressions ${segment.currentImpressions} (${segment.impressionsDelta > 0 ? '+' : ''}${segment.impressionsDelta}), CTR ${segment.currentCtr.toFixed(2)}% (${segment.ctrDelta > 0 ? '+' : ''}${segment.ctrDelta.toFixed(2)} pts)`,
      );
    }
  }
  lines.push('');
  lines.push('## Next Month Priorities');
  lines.push('');
  if (monthly.nextMonthPriorities.length === 0) {
    lines.push('- No immediate next-month priorities identified.');
  } else {
    for (const item of monthly.nextMonthPriorities) {
      lines.push(`- ${item.action} [owner=${item.owner}; impact=${item.impact}]`);
    }
  }
  lines.push('');
  lines.push('## Analyst Appendix');
  lines.push('');
  lines.push(`- Client Summary: ${monthly.analystAppendix.clientSummary.join(' ')}`);
  if (monthly.analystAppendix.analystSummary && monthly.analystAppendix.analystSummary.length > 0) {
    lines.push(`- Analyst Summary: ${monthly.analystAppendix.analystSummary.join(' ')}`);
  }
  lines.push('');
  lines.push('### Workflow Steps');
  for (const step of monthly.analystAppendix.steps) {
    lines.push(`- ${step.step} [status=${step.status}] ${step.summary}`);
  }
  lines.push('');
  lines.push('### Supporting Issues');
  if (monthly.analystAppendix.issues.length === 0) {
    lines.push('- No issues identified.');
  } else {
    for (const issue of monthly.analystAppendix.issues.slice(0, 5)) {
      lines.push(
        `- ${issue.title} [severity=${issue.severity}; impact=${issue.impact}; owner=${issue.owner}]`,
      );
    }
  }
  lines.push('');
  lines.push('### Supporting Actions');
  if (monthly.analystAppendix.actions.length === 0) {
    lines.push('- No workflow actions identified.');
  } else {
    for (const action of monthly.analystAppendix.actions.slice(0, 5)) {
      lines.push(`- ${action.action} [owner=${action.owner}; impact=${action.impact}]`);
    }
  }

  return lines.join('\n');
}

function buildMarkdownReport(report: WorkflowReport): string {
  if (report.pack.name === 'monthly_seo' && report.sections.monthlySeo) {
    return buildMonthlySeoMarkdownReport(report, report.sections.monthlySeo);
  }

  const lines: string[] = [];
  lines.push(`# ${report.meta.title}`);
  lines.push('');
  lines.push(`- Site: ${report.site.siteUrl}`);
  lines.push(`- Profile: ${report.site.profile}`);
  lines.push(`- Date Range: ${report.site.dateRange.startDate} to ${report.site.dateRange.endDate}`);
  lines.push(`- Detail Mode: ${report.meta.detailMode}`);
  if (report.meta.reportPack) {
    lines.push(`- Report Pack: ${report.meta.reportPack}`);
  }
  lines.push(`- Pack Headline: ${report.pack.headline}`);
  if (report.meta.brand?.name) {
    lines.push(`- Brand: ${report.meta.brand.name}`);
  }
  lines.push(`- Steps Run: ${report.sections.drilldown.length}`);
  lines.push(`- Steps Succeeded: ${report.executiveSummary.stepsSucceeded}`);
  lines.push(`- Steps Failed: ${report.executiveSummary.stepsFailed}`);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`- Status: ${report.executiveSummary.overallStatus}`);
  lines.push(`- Pack Summary: ${report.pack.summary}`);
  lines.push(
    `- Key Actions: ${report.executiveSummary.keyActions.join('; ') || 'No immediate actions identified.'}`,
  );
  lines.push(`- Client Summary: ${report.audience.clientSummary.join(' ')}`);
  if (report.audience.analystSummary && report.audience.analystSummary.length > 0) {
    lines.push(`- Analyst Summary: ${report.audience.analystSummary.join(' ')}`);
  }
  lines.push('');
  lines.push('## Actions');
  lines.push('');
  for (const action of report.actions.slice(0, 5)) {
    lines.push(
      `- ${action.action} [owner=${action.owner}; impact=${action.impact}; effort=${action.effort}]`,
    );
  }
  if (report.actions.length === 0) {
    lines.push('- No prioritized actions identified.');
  }
  lines.push('');
  lines.push('## Issues');
  lines.push('');
  for (const issue of report.issues.slice(0, 5)) {
    lines.push(
      `- ${issue.title} [severity=${issue.severity}; impact=${issue.impact}; effort=${issue.effort}; owner=${issue.owner}]`,
    );
  }
  if (report.issues.length === 0) {
    lines.push('- No issues identified.');
  }
  lines.push('');
  lines.push('## Step Results');
  lines.push('');

  for (const step of report.sections.drilldown) {
    lines.push(`### ${step.step}`);
    lines.push(`- Status: ${step.status}`);
    if (step.status === 'error') {
      lines.push(`- Error: ${getReportStepError(step.error, report.meta.detailMode)}`);
    } else {
      const keys = Object.keys((step.data ?? {}) as Record<string, unknown>).slice(0, 8);
      lines.push(`- Data Keys: ${keys.join(', ') || 'none'}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildMonthlySeoHtmlReport(
  report: WorkflowReport,
  monthly: WorkflowMonthlyReportSection,
): string {
  const accentColor = report.meta.brand?.accentColor ?? '#0F172A';
  const brandName = report.meta.brand?.name ?? 'SEO Workflow';
  const logoMarkup = report.meta.brand?.logoUrl
    ? `<img class="brand-logo" src="${escapeHtml(report.meta.brand.logoUrl)}" alt="${escapeHtml(brandName)} logo" />`
    : '';
  const noteMarkup = monthly.note
    ? `
      <section class="section summary-list">
        <h2>Report Note</h2>
        ${buildListItems([monthly.note])}
      </section>
    `
    : '';
  const kpiCards =
    monthly.kpiSummary.length > 0
      ? monthly.kpiSummary
          .map(
            (metric) => `
              <article class="stat-card">
                <div class="stat-label">${escapeHtml(metric.label)}</div>
                <div class="stat-value">${escapeHtml(formatMonthlyMetricValue(metric))}</div>
                <p class="step-copy">${escapeHtml(formatMonthlyDelta(metric))}</p>
              </article>
            `,
          )
          .join('')
      : '<p class="empty-state">Monthly KPI summary was not available for this run.</p>';
  const narrativeItems = monthly.narrative.length > 0 ? monthly.narrative.map((item) => item.text) : ['No month-over-month commentary available for this period.'];
  const brandCards =
    monthly.brandPerformance.length > 0
      ? monthly.brandPerformance
          .map(
            (segment) => `
              <article class="stat-card">
                <div class="stat-label">${escapeHtml(segment.segment === 'branded' ? 'Branded' : 'Non-branded')}</div>
                <div class="stat-value">${segment.currentClicks}</div>
                <p class="step-copy">Clicks Δ ${segment.clicksDelta > 0 ? '+' : ''}${segment.clicksDelta} | Impressions Δ ${segment.impressionsDelta > 0 ? '+' : ''}${segment.impressionsDelta}</p>
                <p class="step-copy">CTR ${segment.currentCtr.toFixed(2)}% (${segment.ctrDelta > 0 ? '+' : ''}${segment.ctrDelta.toFixed(2)} pts)</p>
              </article>
            `,
          )
          .join('')
      : '<p class="empty-state">No brand segmentation data available for the selected period.</p>';
  const priorityCards =
    monthly.nextMonthPriorities.length > 0
      ? monthly.nextMonthPriorities
          .map(
            (priority) => `
              <article class="step-card">
                <div class="step-card-head">
                  <h3>${escapeHtml(priority.action)}</h3>
                  <span class="step-status status-success">${escapeHtml(priority.owner)}</span>
                </div>
                <p class="step-copy">${escapeHtml(priority.clientSummary)}</p>
                <p class="step-copy">Impact: ${escapeHtml(priority.impact)}</p>
              </article>
            `,
          )
          .join('')
      : '<p class="empty-state">No immediate next-month priorities identified.</p>';
  const appendixStepCards = monthly.analystAppendix.steps
    .map(
      (step) => `
        <article class="step-card">
          <div class="step-card-head">
            <h3>${escapeHtml(step.step)}</h3>
            <span class="step-status ${step.status === 'success' ? 'status-success' : 'status-error'}">${escapeHtml(step.status)}</span>
          </div>
          <p class="step-copy">${escapeHtml(step.summary)}</p>
        </article>
      `,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(report.meta.title)}</title>
    <style>
      :root {
        --accent: ${accentColor};
        --accent-soft: color-mix(in srgb, ${accentColor} 14%, white);
        --bg: #f5f1e8;
        --surface: #fffdf9;
        --ink: #172033;
        --muted: #5b6475;
        --border: rgba(23, 32, 51, 0.12);
        --success: #0f766e;
        --error: #b42318;
        --shadow: 0 20px 50px rgba(23, 32, 51, 0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,0.72), transparent 38%),
          linear-gradient(180deg, #f8f4eb 0%, var(--bg) 100%);
        color: var(--ink);
      }
      .page {
        max-width: 1120px;
        margin: 0 auto;
        padding: 40px 24px 72px;
      }
      .hero {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 24px;
        box-shadow: var(--shadow);
        overflow: hidden;
      }
      .hero-accent {
        height: 14px;
        background: linear-gradient(90deg, var(--accent), #d7a04d 78%);
      }
      .hero-body {
        padding: 28px;
      }
      .hero-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 24px;
      }
      .brand-lockup {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .brand-logo {
        width: 64px;
        height: 64px;
        object-fit: contain;
        border-radius: 18px;
        background: white;
        border: 1px solid var(--border);
        padding: 8px;
      }
      .eyebrow {
        margin: 0 0 6px;
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.18em;
      }
      h1, h2, h3, p { margin: 0; }
      h1 {
        font-size: clamp(2rem, 4vw, 3.6rem);
        line-height: 0.95;
        max-width: 10ch;
      }
      .hero-copy {
        max-width: 62ch;
        margin-top: 16px;
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.65;
      }
      .hero-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .pill {
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--ink);
        border: 1px solid rgba(23, 32, 51, 0.08);
        font-size: 0.92rem;
      }
      .section {
        margin-top: 24px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 24px;
        box-shadow: var(--shadow);
        padding: 24px;
      }
      .section h2 {
        margin-bottom: 16px;
        font-size: 1.35rem;
      }
      .section h3 {
        margin-bottom: 12px;
        font-size: 1.05rem;
      }
      .stats, .table-grid, .step-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
      }
      .stat-card, .step-card, .table-card {
        border-radius: 18px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,0.7);
        padding: 18px;
      }
      .stat-label {
        color: var(--muted);
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .stat-value {
        margin-top: 10px;
        font-size: 2rem;
        line-height: 1;
      }
      .summary-list ul {
        margin: 0;
        padding-left: 20px;
      }
      .summary-list li {
        margin: 0 0 10px;
        line-height: 1.55;
      }
      .empty-state, .step-copy {
        color: var(--muted);
        line-height: 1.6;
      }
      .step-card-head {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .step-status {
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: white;
      }
      .status-success { background: var(--success); }
      .status-error { background: var(--error); }
      .table-wrap {
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.95rem;
      }
      th, td {
        padding: 10px 8px;
        border-top: 1px solid var(--border);
        text-align: left;
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      @page {
        size: A4;
        margin: 14mm;
      }
      @media print {
        body { background: white; }
        .page { max-width: none; padding: 0; }
        .hero, .section { box-shadow: none; break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <div class="hero-accent"></div>
        <div class="hero-body">
          <div class="hero-top">
            <div class="brand-lockup">
              ${logoMarkup}
              <div>
                <p class="eyebrow">${escapeHtml(brandName)}</p>
                <h1>${escapeHtml(report.meta.title)}</h1>
              </div>
            </div>
            <div class="hero-pills">
              <span class="pill">Current: ${escapeHtml(monthly.comparison.current.startDate)} to ${escapeHtml(monthly.comparison.current.endDate)}</span>
              <span class="pill">Previous: ${escapeHtml(monthly.comparison.previous.startDate)} to ${escapeHtml(monthly.comparison.previous.endDate)}</span>
              <span class="pill">Pack: ${escapeHtml(report.pack.headline)}</span>
            </div>
          </div>
          <p class="hero-copy">${escapeHtml(report.pack.summary)}</p>
        </div>
      </section>

      ${noteMarkup}

      <section class="section">
        <h2>KPI Summary</h2>
        <div class="stats">
          ${kpiCards}
        </div>
      </section>

      <section class="section summary-list">
        <h2>Month-over-Month Summary</h2>
        ${buildListItems(narrativeItems)}
      </section>

      <section class="section">
        <h2>Visibility Wins</h2>
        <div class="table-grid">
          ${buildMonthlyHtmlTable('Query Wins', monthly.visibilityWins.queries, true)}
          ${buildMonthlyHtmlTable('Page Wins', monthly.visibilityWins.pages)}
        </div>
      </section>

      <section class="section">
        <h2>Popular Searches</h2>
        <div class="table-grid">
          ${buildMonthlyHtmlTable('Top Queries', monthly.popularSearches.topQueries, true)}
          ${buildMonthlyHtmlTable('Rising Queries', monthly.popularSearches.risingQueries, true)}
        </div>
      </section>

      <section class="section">
        <h2>Top Pages</h2>
        <div class="table-grid">
          ${buildMonthlyHtmlTable('Best Performing Pages', monthly.topPages.topPages)}
          ${buildMonthlyHtmlTable('Improving Pages', monthly.topPages.improvingPages)}
        </div>
      </section>

      <section class="section">
        <h2>Brand vs Non-Brand Performance</h2>
        <div class="stats">
          ${brandCards}
        </div>
      </section>

      <section class="section">
        <h2>Next Month Priorities</h2>
        <div class="step-grid">
          ${priorityCards}
        </div>
      </section>

      <section class="section summary-list">
        <h2>Analyst Appendix</h2>
        ${buildListItems(monthly.analystAppendix.clientSummary)}
        ${
          monthly.analystAppendix.analystSummary && monthly.analystAppendix.analystSummary.length > 0
            ? `<h3>Analyst Notes</h3>${buildListItems(monthly.analystAppendix.analystSummary)}`
            : ''
        }
      </section>

      <section class="section">
        <h2>Workflow Steps</h2>
        <div class="step-grid">
          ${appendixStepCards}
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function buildHtmlReport(report: WorkflowReport): string {
  if (report.pack.name === 'monthly_seo' && report.sections.monthlySeo) {
    return buildMonthlySeoHtmlReport(report, report.sections.monthlySeo);
  }

  const accentColor = report.meta.brand?.accentColor ?? '#0F172A';
  const brandName = report.meta.brand?.name ?? 'SEO Workflow';
  const logoMarkup = report.meta.brand?.logoUrl
    ? `<img class="brand-logo" src="${escapeHtml(report.meta.brand.logoUrl)}" alt="${escapeHtml(brandName)} logo" />`
    : '';
  const reportPackMarkup = report.meta.reportPack
    ? `<span class="pill">Pack: ${escapeHtml(report.meta.reportPack)}</span>`
    : '';
  const stepCards = report.sections.drilldown
    .map((step) => {
      const statusClass = step.status === 'success' ? 'status-success' : 'status-error';
      const detailMarkup =
        step.status === 'error'
          ? `<p class="step-copy">${escapeHtml(getReportStepError(step.error, report.meta.detailMode))}</p>`
          : `<p class="step-copy">Data keys: ${escapeHtml(
              Object.keys((step.data ?? {}) as Record<string, unknown>).slice(0, 8).join(', ') || 'none',
            )}</p>`;

      return `
        <article class="step-card">
          <div class="step-card-head">
            <h3>${escapeHtml(step.step)}</h3>
            <span class="step-status ${statusClass}">${escapeHtml(step.status)}</span>
          </div>
          ${detailMarkup}
        </article>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(report.meta.title)}</title>
    <style>
      :root {
        --accent: ${accentColor};
        --accent-soft: color-mix(in srgb, ${accentColor} 14%, white);
        --bg: #f5f1e8;
        --surface: #fffdf9;
        --ink: #172033;
        --muted: #5b6475;
        --border: rgba(23, 32, 51, 0.12);
        --success: #0f766e;
        --error: #b42318;
        --shadow: 0 20px 50px rgba(23, 32, 51, 0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,0.72), transparent 38%),
          linear-gradient(180deg, #f8f4eb 0%, var(--bg) 100%);
        color: var(--ink);
      }
      .page {
        max-width: 1120px;
        margin: 0 auto;
        padding: 40px 24px 72px;
      }
      .hero {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 24px;
        box-shadow: var(--shadow);
        overflow: hidden;
      }
      .hero-accent {
        height: 14px;
        background: linear-gradient(90deg, var(--accent), #d7a04d 78%);
      }
      .hero-body {
        padding: 28px;
      }
      .hero-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 24px;
      }
      .brand-lockup {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .brand-logo {
        width: 64px;
        height: 64px;
        object-fit: contain;
        border-radius: 18px;
        background: white;
        border: 1px solid var(--border);
        padding: 8px;
      }
      .eyebrow {
        margin: 0 0 6px;
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.18em;
      }
      h1, h2, h3, p { margin: 0; }
      h1 {
        font-size: clamp(2rem, 4vw, 3.6rem);
        line-height: 0.95;
        max-width: 10ch;
      }
      .hero-copy {
        max-width: 62ch;
        margin-top: 16px;
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.65;
      }
      .hero-pills, .meta-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .pill {
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--ink);
        border: 1px solid rgba(23, 32, 51, 0.08);
        font-size: 0.92rem;
      }
      .section {
        margin-top: 24px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 24px;
        box-shadow: var(--shadow);
        padding: 24px;
      }
      .section h2 {
        margin-bottom: 16px;
        font-size: 1.35rem;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 16px;
      }
      .stat-card, .step-card {
        border-radius: 18px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,0.7);
        padding: 18px;
      }
      .stat-label {
        color: var(--muted);
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .stat-value {
        margin-top: 10px;
        font-size: 2rem;
        line-height: 1;
      }
      .summary-list ul {
        margin: 0;
        padding-left: 20px;
      }
      .summary-list li {
        margin: 0 0 10px;
        line-height: 1.55;
      }
      .empty-state, .step-copy {
        color: var(--muted);
        line-height: 1.6;
      }
      .step-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }
      .step-card-head {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .step-card h3 {
        font-size: 1.05rem;
      }
      .step-status {
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: white;
      }
      .status-success { background: var(--success); }
      .status-error { background: var(--error); }
      @page {
        size: A4;
        margin: 14mm;
      }
      @media print {
        body {
          background: white;
        }
        .page {
          max-width: none;
          padding: 0;
        }
        .hero, .section {
          box-shadow: none;
          break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <div class="hero-accent"></div>
        <div class="hero-body">
          <div class="hero-top">
            <div class="brand-lockup">
              ${logoMarkup}
              <div>
                <p class="eyebrow">${escapeHtml(brandName)}</p>
                <h1>${escapeHtml(report.meta.title)}</h1>
              </div>
            </div>
            <div class="hero-pills">
              <span class="pill">Profile: ${escapeHtml(report.site.profile)}</span>
              <span class="pill">Detail: ${escapeHtml(report.meta.detailMode)}</span>
              ${reportPackMarkup}
            </div>
          </div>
          <p class="hero-copy">
            ${escapeHtml(report.pack.summary)}
          </p>
        </div>
      </section>

      <section class="section">
        <h2>Executive Summary</h2>
        <div class="stats">
          <div class="stat-card">
            <div class="stat-label">Overall Status</div>
            <div class="stat-value">${escapeHtml(report.executiveSummary.overallStatus)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Steps Succeeded</div>
            <div class="stat-value">${report.executiveSummary.stepsSucceeded}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Steps Failed</div>
            <div class="stat-value">${report.executiveSummary.stepsFailed}</div>
          </div>
        </div>
      </section>

      <section class="section summary-list">
        <h2>Key Actions</h2>
        ${buildListItems(report.executiveSummary.keyActions)}
      </section>

      <section class="section summary-list">
        <h2>Audience Summary</h2>
        ${buildListItems(report.audience.clientSummary)}
        ${
          report.audience.analystSummary && report.audience.analystSummary.length > 0
            ? `<h3>Analyst Notes</h3>${buildListItems(report.audience.analystSummary)}`
            : ''
        }
      </section>

      <section class="section">
        <h2>Pack Context</h2>
        <div class="stats">
          <div class="stat-card">
            <div class="stat-label">Headline</div>
            <p class="step-copy">${escapeHtml(report.pack.headline)}</p>
          </div>
          <div class="stat-card">
            <div class="stat-label">Cadence</div>
            <div class="stat-value">${escapeHtml(report.pack.cadence)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Primary Audience</div>
            <div class="stat-value">${escapeHtml(report.pack.primaryAudience)}</div>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Prioritized Actions</h2>
        <div class="step-grid">
          ${report.actions.length > 0
            ? report.actions
                .slice(0, 6)
                .map(
                  (action) => `
                <article class="step-card">
                  <div class="step-card-head">
                    <h3>${escapeHtml(action.action)}</h3>
                    <span class="step-status status-success">${escapeHtml(action.owner)}</span>
                  </div>
                  <p class="step-copy">${escapeHtml(action.clientSummary)}</p>
                  <p class="step-copy">Impact: ${escapeHtml(action.impact)} | Effort: ${escapeHtml(action.effort)}</p>
                </article>
              `,
                )
                .join('')
            : '<p class="empty-state">No prioritized actions identified.</p>'}
        </div>
      </section>

      <section class="section">
        <h2>Issues</h2>
        <div class="step-grid">
          ${report.issues.length > 0
            ? report.issues
                .slice(0, 6)
                .map(
                  (issue) => `
                <article class="step-card">
                  <div class="step-card-head">
                    <h3>${escapeHtml(issue.title)}</h3>
                    <span class="step-status status-error">${escapeHtml(issue.severity)}</span>
                  </div>
                  <p class="step-copy">${escapeHtml(issue.clientSummary)}</p>
                  <p class="step-copy">Impact: ${escapeHtml(issue.impact)} | Effort: ${escapeHtml(issue.effort)} | Owner: ${escapeHtml(issue.owner)}</p>
                </article>
              `,
                )
                .join('')
            : '<p class="empty-state">No issues identified.</p>'}
        </div>
      </section>

      <section class="section">
        <h2>Workflow Steps</h2>
        <div class="step-grid">
          ${stepCards}
        </div>
      </section>
    </main>
  </body>
</html>`;
}

export async function handleRunSeoAuditWorkflow(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = RunSeoAuditWorkflowSchema.parse(raw);
  const { startDate, endDate } = resolveDateRange(args);
  const reportFormat = resolveReportFormat(args);

  const sampleUrl = args.sampleUrl ?? args.urls?.[0] ?? undefined;
  const steps: WorkflowStepResult[] = [];

  if (args.profile === 'technical') {
    if (sampleUrl) {
      steps.push(
        await runStep('page_health_dashboard', () =>
          handlePageHealthDashboard(service, {
            siteUrl: args.siteUrl,
            url: sampleUrl,
            startDate,
            endDate,
            categories: ['performance', 'seo'],
          }),
        ),
      );
    }
    steps.push(
      await runStep('indexing_health_report', () =>
        handleIndexingHealthReport(service, {
          siteUrl: args.siteUrl,
          source: args.sitemapUrls?.length || args.urls?.length ? 'combined' : 'analytics',
          urls: args.urls,
          sitemapUrls: args.sitemapUrls,
          startDate,
          endDate,
          topN: args.topN,
        }),
      ),
    );
    steps.push(
      await runStep('drop_alerts', () =>
        handleDropAlerts(service, {
          siteUrl: args.siteUrl,
          ...(args.days ? { days: args.days } : { startDate, endDate }),
          threshold: 40,
          seasonalAdjustment: true,
          includeChangePoints: true,
          rowLimit: args.rowLimit,
        }),
      ),
    );
  }

  if (args.profile === 'content') {
    steps.push(
      await runStep('detect_quick_wins', () =>
        handleDetectQuickWins(service, {
          siteUrl: args.siteUrl,
          startDate,
          endDate,
          maxRows: args.rowLimit,
          intentAware: true,
        }),
      ),
    );
    steps.push(
      await runStep('detect_content_decay', () =>
        handleContentDecay(service, {
          siteUrl: args.siteUrl,
          ...(args.days ? { days: args.days } : { startDate, endDate }),
          rowLimit: args.rowLimit,
        }),
      ),
    );
    steps.push(
      await runStep('recommend_next_actions', () =>
        handleRecommendNextActions(service, {
          siteUrl: args.siteUrl,
          startDate,
          endDate,
          rowLimit: args.rowLimit,
          topActions: 5,
          includeCwv: true,
        }),
      ),
    );
  }

  if (args.profile === 'indexing') {
    steps.push(
      await runStep('indexing_health_report', () =>
        handleIndexingHealthReport(service, {
          siteUrl: args.siteUrl,
          source: args.urls?.length || args.sitemapUrls?.length ? 'combined' : 'analytics',
          urls: args.urls,
          sitemapUrls: args.sitemapUrls,
          startDate,
          endDate,
          topN: args.topN,
        }),
      ),
    );
    if (sampleUrl) {
      steps.push(
        await runStep('page_health_dashboard', () =>
          handlePageHealthDashboard(service, {
            siteUrl: args.siteUrl,
            url: sampleUrl,
            startDate,
            endDate,
            categories: ['performance'],
          }),
        ),
      );
    }
    steps.push(
      await runStep('recommend_next_actions', () =>
        handleRecommendNextActions(service, {
          siteUrl: args.siteUrl,
          startDate,
          endDate,
          rowLimit: args.rowLimit,
          includeCwv: false,
          topActions: 5,
        }),
      ),
    );
  }

  const successful = steps.filter((step) => step.status === 'success');
  const failed = steps.filter((step) => step.status === 'error');

  const keyActions = successful
    .map((step) => step.data as Record<string, unknown>)
    .flatMap((data) => {
      if (Array.isArray(data?.recommendations) && data.recommendations.length > 0) {
        const top = data.recommendations[0] as Record<string, unknown>;
        return [String(top.action ?? 'Review top recommendation')];
      }
      if (typeof data?.alertCount === 'number' && data.alertCount > 0) {
        return [`Investigate ${data.alertCount} traffic drop alert(s)`];
      }
      if (typeof data?.notIndexed === 'number' && data.notIndexed > 0) {
        return [`Resolve ${data.notIndexed} non-indexed URL(s)`];
      }
      return [];
    })
    .slice(0, 5);

  const payload = {
    profile: args.profile,
    siteUrl: args.siteUrl,
    dateRange: { startDate, endDate },
    reportFormat,
    reportPack: args.reportPack ?? null,
    detailMode: args.detailMode,
    brand: args.brand ?? null,
    executiveSummary: {
      overallStatus: failed.length === 0 ? 'healthy' : successful.length > 0 ? 'partial' : 'failed',
      stepsSucceeded: successful.length,
      stepsFailed: failed.length,
      keyActions,
    } satisfies WorkflowExecutiveSummary,
    sections: {
      drilldown: steps,
    },
    steps,
  };

  const professionalOutputs = buildProfessionalOutputs(steps, args.detailMode);

  const report: WorkflowReport = {
    meta: {
      title: getReportTitle(args.profile, args.reportPack),
      generatedAt: new Date().toISOString(),
      format: reportFormat,
      detailMode: args.detailMode,
      reportPack: args.reportPack ?? null,
      brand: args.brand ?? null,
    },
    pack: getReportPackConfig(args.profile, args.reportPack),
    site: {
      siteUrl: args.siteUrl,
      profile: args.profile,
      dateRange: { startDate, endDate },
    },
    executiveSummary: payload.executiveSummary,
    audience: {
      detailMode: args.detailMode,
      clientSummary: professionalOutputs.clientSummary,
      ...(professionalOutputs.analystSummary && professionalOutputs.analystSummary.length > 0
        ? { analystSummary: professionalOutputs.analystSummary }
        : {}),
    },
    issues: professionalOutputs.issues,
    actions: professionalOutputs.actions,
    sections: payload.sections,
  };

  if (args.reportPack === 'monthly_seo' && args.profile !== 'content') {
    report.sections.monthlySeo = buildMonthlySeoFallbackSection(
      report,
      'The monthly SEO client report is only available for the content profile.',
    );
  } else if (args.reportPack === 'monthly_seo' && args.profile === 'content') {
    try {
      report.sections.monthlySeo = await buildMonthlySeoReportSection(service, args, report, steps);
    } catch (error) {
      report.sections.monthlySeo = buildMonthlySeoFallbackSection(
        report,
        'Monthly performance comparison could not be generated for this run. The workflow appendix is included below for follow-up.',
      );
      if (args.detailMode !== 'client') {
        report.audience.analystSummary = [
          ...(report.audience.analystSummary ?? []),
          `Monthly client report enrichment failed: ${error instanceof Error ? error.message : String(error)}`,
        ];
      }
    }
  }

  return jsonResult({
    ...payload,
    clientSummary: professionalOutputs.clientSummary,
    ...(professionalOutputs.analystSummary && professionalOutputs.analystSummary.length > 0
      ? { analystSummary: professionalOutputs.analystSummary }
      : {}),
    issues: professionalOutputs.issues,
    actions: professionalOutputs.actions,
    report,
    ...((reportFormat === 'markdown' || reportFormat === 'all')
      ? { markdownReport: buildMarkdownReport(report) }
      : {}),
    ...((reportFormat === 'html' || reportFormat === 'all')
      ? { htmlReport: buildHtmlReport(report) }
      : {}),
  });
}
