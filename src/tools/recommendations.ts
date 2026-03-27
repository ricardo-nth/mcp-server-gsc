import { SearchConsoleService } from '../service.js';
import { RecommendNextActionsSchema } from '../schemas/recommendations.js';
import { resolveDateRange } from '../utils/dates.js';
import { deriveBrandTerms, detectBrandSegment, detectPageTemplate } from '../utils/seo-analysis.js';
import {
  confidenceScore,
  cwvOpportunityFromPerformanceScore,
  impactBucket,
  indexingHealthOpportunity,
  normalizeByMax,
  rankDistanceScore,
  weightedOpportunityScore,
} from '../utils/scoring.js';
import { jsonResult, type SearchAnalyticsRow, type ToolResult } from '../utils/types.js';

interface CandidateSignal {
  query: string;
  page: string;
  impressions: number;
  clicks: number;
  ctrPct: number;
  position: number;
  clickUpside: number;
  brandSegment: 'branded' | 'non_branded';
  pageTemplate: string;
}

interface PageDiagnostic {
  verdict?: string;
  coverageState?: string;
  performanceScore?: number;
}

function targetCtrByPosition(position: number): number {
  if (position <= 1) return 28;
  if (position <= 3) return 12;
  if (position <= 5) return 7;
  if (position <= 10) return 4;
  return 2;
}

function getSignals(
  rows: SearchAnalyticsRow[],
  minImpressions: number,
  brandTerms: string[],
): CandidateSignal[] {
  return rows
    .map((row) => {
      const query = row.keys?.[0] ?? '';
      const page = row.keys?.[1] ?? '';
      const impressions = row.impressions ?? 0;
      const clicks = row.clicks ?? 0;
      const ctrPct = (row.ctr ?? 0) * 100;
      const position = row.position ?? 0;
      const targetCtr = targetCtrByPosition(position);
      const clickUpside = Math.max(0, Math.round(((targetCtr - ctrPct) / 100) * impressions));
      return {
        query,
        page,
        impressions,
        clicks,
        ctrPct: Number(ctrPct.toFixed(2)),
        position: Number(position.toFixed(2)),
        clickUpside,
        brandSegment: detectBrandSegment(query, brandTerms),
        pageTemplate: detectPageTemplate(page),
      };
    })
    .filter(
      (signal) =>
        signal.query.length > 0 &&
        signal.page.length > 0 &&
        signal.impressions >= minImpressions &&
        signal.position > 0,
    );
}

export async function handleRecommendNextActions(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = RecommendNextActionsSchema.parse(raw);
  const { startDate, endDate } = resolveDateRange(args);
  const brandTerms = deriveBrandTerms(args.siteUrl, args.brandTerms);

  const analytics = await service.searchAnalytics(args.siteUrl, {
    startDate,
    endDate,
    dimensions: ['query', 'page'],
    rowLimit: args.rowLimit,
    dataState: 'all',
  });
  const rows = ((analytics.data as { rows?: SearchAnalyticsRow[] }).rows ?? []) as SearchAnalyticsRow[];
  const signals = getSignals(rows, args.minImpressions, brandTerms);

  if (signals.length === 0) {
    return jsonResult({
      siteUrl: args.siteUrl,
      dateRange: { startDate, endDate },
      analyzedRows: 0,
      diagnosticsPagesChecked: 0,
      brandTermsUsed: brandTerms,
      segmentationSummary: [],
      templateGroups: [],
      recommendations: [],
      note: 'No query-page opportunities matched filters.',
    });
  }

  const pagesByUpside = new Map<string, number>();
  for (const signal of signals) {
    pagesByUpside.set(signal.page, (pagesByUpside.get(signal.page) ?? 0) + signal.clickUpside);
  }

  const diagnosticPages = Array.from(pagesByUpside.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, args.maxDiagnosticPages)
    .map(([page]) => page);

  const diagnostics = new Map<string, PageDiagnostic>();
  await Promise.all(
    diagnosticPages.map(async (page) => {
      const diagnostic: PageDiagnostic = {};
      try {
        const inspection = await service.indexInspect({
          siteUrl: args.siteUrl,
          inspectionUrl: page,
          languageCode: args.languageCode,
        });
        const indexStatus = (inspection.data as Record<string, unknown>)
          ?.inspectionResult as Record<string, unknown> | undefined;
        const status = indexStatus?.indexStatusResult as Record<string, unknown> | undefined;
        diagnostic.verdict = status?.verdict as string | undefined;
        diagnostic.coverageState = status?.coverageState as string | undefined;
      } catch {
        diagnostic.verdict = undefined;
      }

      if (args.includeCwv) {
        try {
          const pageSpeed = await service.runPageSpeed({
            url: page,
            categories: ['performance'],
            strategy: 'mobile',
          });
          const lighthouse = (pageSpeed.data as Record<string, unknown>)
            ?.lighthouseResult as Record<string, unknown> | undefined;
          const categories = lighthouse?.categories as
            | Record<string, { score?: number }>
            | undefined;
          diagnostic.performanceScore = categories?.performance?.score;
        } catch {
          diagnostic.performanceScore = undefined;
        }
      }

      diagnostics.set(page, diagnostic);
    }),
  );

  const maxUpside = Math.max(...signals.map((signal) => signal.clickUpside), 1);
  const maxImpressions = Math.max(...signals.map((signal) => signal.impressions), 1);

  const ranked = signals
    .map((signal) => {
      const diagnostic = diagnostics.get(signal.page);
      const components = {
        clickUpside: normalizeByMax(signal.clickUpside, maxUpside),
        impressionVolume: normalizeByMax(signal.impressions, maxImpressions),
        rankDistance: rankDistanceScore(signal.position),
        indexingHealth: indexingHealthOpportunity(diagnostic?.verdict),
        cwvQuality: cwvOpportunityFromPerformanceScore(diagnostic?.performanceScore),
      };

      const score = weightedOpportunityScore(components);
      const diagnosticsCoverage =
        50 +
        (diagnostic?.verdict ? 25 : 0) +
        (args.includeCwv && diagnostic?.performanceScore !== undefined ? 25 : 0);
      const confidence = confidenceScore({
        impressions: signal.impressions,
        diagnosticsCoverage,
        clickUpside: signal.clickUpside,
      });

      const recommendationType =
        components.indexingHealth >= 80
          ? 'indexing_fix'
          : components.cwvQuality >= 70
            ? 'cwv_improvement'
            : 'ctr_optimization';
      const action =
        recommendationType === 'indexing_fix'
          ? `Fix indexing blockers for ${signal.page}`
          : recommendationType === 'cwv_improvement'
            ? `Improve Core Web Vitals for ${signal.page}`
            : `Improve title/meta for query "${signal.query}" on ${signal.page}`;

      return {
        type: recommendationType,
        action,
        query: signal.query,
        page: signal.page,
        brandSegment: signal.brandSegment,
        pageTemplate: signal.pageTemplate,
        score,
        confidence,
        impact: impactBucket(score),
        rationale: [
          `Click upside estimate: +${signal.clickUpside} from ${signal.impressions} impressions.`,
          `Current avg position ${signal.position} with CTR ${signal.ctrPct}%.`,
          `Index verdict: ${diagnostic?.verdict ?? 'unknown'}, CWV performance score: ${diagnostic?.performanceScore ?? 'unknown'}.`,
        ],
        reasonFields: {
          clickUpside: signal.clickUpside,
          impressions: signal.impressions,
          position: signal.position,
          ctrPct: signal.ctrPct,
          brandSegment: signal.brandSegment,
          pageTemplate: signal.pageTemplate,
          indexVerdict: diagnostic?.verdict ?? null,
          cwvPerformanceScore: diagnostic?.performanceScore ?? null,
        },
        scoreComponents: components,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.confidence - a.confidence ||
        b.reasonFields.clickUpside - a.reasonFields.clickUpside ||
        a.action.localeCompare(b.action),
    )
    .slice(0, args.topActions);

  const segmentationSummary = Array.from(
    signals.reduce<
      Map<
        CandidateSignal['brandSegment'],
        { segment: CandidateSignal['brandSegment']; opportunities: number; totalClickUpside: number; totalImpressions: number }
      >
    >((acc, signal) => {
      const current = acc.get(signal.brandSegment) ?? {
        segment: signal.brandSegment,
        opportunities: 0,
        totalClickUpside: 0,
        totalImpressions: 0,
      };
      current.opportunities += 1;
      current.totalClickUpside += signal.clickUpside;
      current.totalImpressions += signal.impressions;
      acc.set(signal.brandSegment, current);
      return acc;
    }, new Map()).values(),
  ).sort((a, b) => b.totalClickUpside - a.totalClickUpside);

  const templateGroups = Array.from(
    signals.reduce<
      Map<
        string,
        { template: string; opportunities: number; totalClickUpside: number; brandedOpportunities: number; nonBrandedOpportunities: number }
      >
    >((acc, signal) => {
      const current = acc.get(signal.pageTemplate) ?? {
        template: signal.pageTemplate,
        opportunities: 0,
        totalClickUpside: 0,
        brandedOpportunities: 0,
        nonBrandedOpportunities: 0,
      };
      current.opportunities += 1;
      current.totalClickUpside += signal.clickUpside;
      if (signal.brandSegment === 'branded') {
        current.brandedOpportunities += 1;
      } else {
        current.nonBrandedOpportunities += 1;
      }
      acc.set(signal.pageTemplate, current);
      return acc;
    }, new Map()).values(),
  ).sort((a, b) => b.totalClickUpside - a.totalClickUpside);

  return jsonResult({
    siteUrl: args.siteUrl,
    dateRange: { startDate, endDate },
    analyzedRows: signals.length,
    diagnosticsPagesChecked: diagnosticPages.length,
    brandTermsUsed: brandTerms,
    segmentationSummary,
    templateGroups,
    recommendations: ranked,
  });
}
