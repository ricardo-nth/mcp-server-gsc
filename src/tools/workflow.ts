import { SearchConsoleService } from '../service.js';
import { RunSeoAuditWorkflowSchema } from '../schemas/workflow.js';
import { resolveDateRange } from '../utils/dates.js';
import { jsonResult, type ToolResult } from '../utils/types.js';
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
type WorkflowReportPack = WorkflowArgs['reportPack'];
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

interface WorkflowReport {
  meta: {
    title: string;
    generatedAt: string;
    format: WorkflowReportFormat;
    detailMode: WorkflowDetailMode;
    reportPack: WorkflowReportPack | null;
    brand: WorkflowBrand | null;
  };
  site: {
    siteUrl: string;
    profile: WorkflowArgs['profile'];
    dateRange: { startDate: string; endDate: string };
  };
  executiveSummary: WorkflowExecutiveSummary;
  sections: {
    drilldown: WorkflowStepResult[];
  };
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

function buildMarkdownReport(report: WorkflowReport): string {
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
  lines.push(
    `- Key Actions: ${report.executiveSummary.keyActions.join('; ') || 'No immediate actions identified.'}`,
  );
  lines.push('');
  lines.push('## Step Results');
  lines.push('');

  for (const step of report.sections.drilldown) {
    lines.push(`### ${step.step}`);
    lines.push(`- Status: ${step.status}`);
    if (step.status === 'error') {
      lines.push(`- Error: ${step.error ?? 'Unknown error'}`);
    } else {
      const keys = Object.keys((step.data ?? {}) as Record<string, unknown>).slice(0, 8);
      lines.push(`- Data Keys: ${keys.join(', ') || 'none'}`);
    }
    lines.push('');
  }

  return lines.join('\n');
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

  const report: WorkflowReport = {
    meta: {
      title: getReportTitle(args.profile, args.reportPack),
      generatedAt: new Date().toISOString(),
      format: reportFormat,
      detailMode: args.detailMode,
      reportPack: args.reportPack ?? null,
      brand: args.brand ?? null,
    },
    site: {
      siteUrl: args.siteUrl,
      profile: args.profile,
      dateRange: { startDate, endDate },
    },
    executiveSummary: payload.executiveSummary,
    sections: payload.sections,
  };

  return jsonResult({
    ...payload,
    report,
    ...(reportFormat === 'markdown' ? { markdownReport: buildMarkdownReport(report) } : {}),
  });
}
