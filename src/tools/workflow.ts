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

interface WorkflowStepResult {
  step: string;
  status: 'success' | 'error';
  data?: unknown;
  error?: string;
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

function buildMarkdownReport(payload: {
  profile: string;
  siteUrl: string;
  dateRange: { startDate: string; endDate: string };
  executiveSummary: Record<string, unknown>;
  steps: WorkflowStepResult[];
}): string {
  const lines: string[] = [];
  lines.push(`# SEO Audit Workflow — ${payload.profile}`);
  lines.push('');
  lines.push(`- Site: ${payload.siteUrl}`);
  lines.push(`- Date Range: ${payload.dateRange.startDate} to ${payload.dateRange.endDate}`);
  lines.push(`- Steps Run: ${payload.steps.length}`);
  lines.push(`- Steps Succeeded: ${payload.executiveSummary.stepsSucceeded as number}`);
  lines.push(`- Steps Failed: ${payload.executiveSummary.stepsFailed as number}`);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`- Status: ${(payload.executiveSummary.overallStatus as string)}`);
  lines.push(`- Key Actions: ${(payload.executiveSummary.keyActions as string[]).join('; ')}`);
  lines.push('');
  lines.push('## Step Results');
  lines.push('');

  for (const step of payload.steps) {
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
          days: args.days ?? 7,
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
          days: args.days ?? 56,
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
    executiveSummary: {
      overallStatus: failed.length === 0 ? 'healthy' : successful.length > 0 ? 'partial' : 'failed',
      stepsSucceeded: successful.length,
      stepsFailed: failed.length,
      keyActions,
    },
    sections: {
      drilldown: steps,
    },
    steps,
  };

  return jsonResult({
    ...payload,
    ...(args.markdown ? { markdownReport: buildMarkdownReport(payload) } : {}),
  });
}
