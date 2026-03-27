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

function buildHtmlReport(report: WorkflowReport): string {
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
          ? `<p class="step-copy">${escapeHtml(step.error ?? 'Unknown error')}</p>`
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
    sections: payload.sections,
  };

  return jsonResult({
    ...payload,
    report,
    ...((reportFormat === 'markdown' || reportFormat === 'all')
      ? { markdownReport: buildMarkdownReport(report) }
      : {}),
    ...((reportFormat === 'html' || reportFormat === 'all')
      ? { htmlReport: buildHtmlReport(report) }
      : {}),
  });
}
