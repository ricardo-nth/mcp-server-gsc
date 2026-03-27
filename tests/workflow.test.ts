import { describe, it, expect, vi } from 'vitest';
import { handleRunSeoAuditWorkflow } from '../src/tools/workflow.js';
import type { SearchConsoleService } from '../src/service.js';
import type { ToolResult } from '../src/utils/types.js';

function parseResult(result: ToolResult): Record<string, unknown> {
  return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
}

describe('run_seo_audit_workflow', () => {
  it('returns shared report payload plus markdown and html output when reportFormat=all', async () => {
    const service = {
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      searchAnalytics: vi.fn().mockResolvedValue({
        data: {
          rows: [{ keys: ['https://example.com/a'], clicks: 100, impressions: 1000, ctr: 0.1, position: 4 }],
        },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.8 }, seo: { score: 0.9 } } } },
      }),
      cruxQueryRecord: vi.fn().mockRejectedValue(new Error('No CrUX data')),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      profile: 'technical',
      urls: ['https://example.com/a'],
      reportFormat: 'all',
      reportPack: 'technical_audit',
      detailMode: 'analyst',
      brand: {
        name: 'Nth Agency',
        logoUrl: 'https://example.com/logo.png',
        accentColor: '#0F172A',
      },
    });

    const payload = parseResult(result);
    expect(payload.profile).toBe('technical');
    expect((payload.steps as Array<unknown>).length).toBeGreaterThan(1);
    expect(typeof payload.markdownReport).toBe('string');
    expect(typeof payload.htmlReport).toBe('string');
    expect(payload.reportFormat).toBe('all');
    expect(payload.detailMode).toBe('analyst');
    expect(payload.reportPack).toBe('technical_audit');
    expect(payload.brand).toEqual({
      name: 'Nth Agency',
      logoUrl: 'https://example.com/logo.png',
      accentColor: '#0F172A',
    });
    expect(payload.report).toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          title: 'Technical SEO Workflow Report',
          format: 'all',
          detailMode: 'analyst',
          reportPack: 'technical_audit',
          brand: {
            name: 'Nth Agency',
            logoUrl: 'https://example.com/logo.png',
            accentColor: '#0F172A',
          },
        }),
        site: expect.objectContaining({
          siteUrl: 'sc-domain:example.com',
          profile: 'technical',
        }),
        pack: expect.objectContaining({
          name: 'technical_audit',
          headline: 'Technical audit pack',
          cadence: 'ad_hoc',
          primaryAudience: 'both',
        }),
        audience: expect.objectContaining({
          detailMode: 'analyst',
        }),
      }),
    );
    expect(payload.issues).toEqual(expect.any(Array));
    expect(payload.actions).toEqual(expect.any(Array));
    expect(payload.clientSummary).toEqual(expect.any(Array));
    expect(payload.analystSummary).toBeUndefined();
    expect(String(payload.htmlReport)).toContain('<!DOCTYPE html>');
    expect(String(payload.htmlReport)).toContain('Nth Agency');
    expect(String(payload.htmlReport)).toContain('#0F172A');
    expect(String(payload.htmlReport)).toContain('Technical audit pack');
    expect(String(payload.htmlReport)).toContain('Prioritized Actions');
    expect(String(payload.markdownReport)).toContain('## Actions');
    expect((payload.executiveSummary as Record<string, unknown>).stepsSucceeded).toBeGreaterThan(0);
  });

  it('renders monthly SEO pack as a client-facing report with performance sections', async () => {
    const searchAnalytics = vi.fn().mockImplementation(async (_siteUrl: string, body: Record<string, unknown>) => {
      const dimensions = (body.dimensions as string[] | undefined) ?? [];
      const startDate = String(body.startDate ?? '');

      if (dimensions.join(',') === 'query,page') {
        return {
          data: {
            rows: [
              {
                keys: ['vertex seo package', 'https://example.com/services/seo'],
                clicks: 20,
                impressions: 300,
                ctr: 0.0667,
                position: 6.2,
              },
            ],
          },
        };
      }

      if (dimensions.join(',') === 'date') {
        return startDate === '2026-03-01'
          ? {
              data: {
                rows: [
                  { keys: ['2026-03-01'], clicks: 60, impressions: 800, ctr: 0.075, position: 8 },
                  { keys: ['2026-03-15'], clicks: 90, impressions: 1200, ctr: 0.075, position: 7.2 },
                ],
              },
            }
          : {
              data: {
                rows: [
                  { keys: ['2026-02-01'], clicks: 40, impressions: 650, ctr: 0.0615, position: 9.3 },
                  { keys: ['2026-02-15'], clicks: 55, impressions: 900, ctr: 0.0611, position: 8.8 },
                ],
              },
            };
      }

      if (dimensions.join(',') === 'query') {
        return startDate === '2026-03-01'
          ? {
              data: {
                rows: [
                  { keys: ['vertex seo package'], clicks: 50, impressions: 500, ctr: 0.1, position: 5.8 },
                  { keys: ['seo retainer uk'], clicks: 35, impressions: 420, ctr: 0.0833, position: 7.1 },
                  { keys: ['digital marketing middlesbrough'], clicks: 22, impressions: 280, ctr: 0.0785, position: 8.4 },
                ],
              },
            }
          : {
              data: {
                rows: [
                  { keys: ['vertex seo package'], clicks: 30, impressions: 360, ctr: 0.0833, position: 7.2 },
                  { keys: ['seo retainer uk'], clicks: 18, impressions: 300, ctr: 0.06, position: 8.1 },
                  { keys: ['digital marketing middlesbrough'], clicks: 24, impressions: 290, ctr: 0.0828, position: 8.1 },
                ],
              },
            };
      }

      if (dimensions.join(',') === 'page') {
        // `detect_content_decay` splits the explicit range into recent/prior halves, so the page
        // mock needs to treat February as the "recent" branch for that step even though the
        // monthly report enrichment later fetches current-period page rows from March.
        return startDate === '2026-02-01'
          ? {
              data: {
                rows: [
                  { keys: ['https://example.com/services/seo'], clicks: 32, impressions: 420, ctr: 0.0762, position: 7.8 },
                  { keys: ['https://example.com/insights/seo'], clicks: 16, impressions: 250, ctr: 0.064, position: 9.5 },
                ],
              },
            }
          : {
              data: {
                rows: [
                  { keys: ['https://example.com/services/seo'], clicks: 48, impressions: 540, ctr: 0.0889, position: 6.4 },
                  { keys: ['https://example.com/insights/seo'], clicks: 25, impressions: 290, ctr: 0.0862, position: 8.2 },
                ],
              },
            };
      }

      return { data: { rows: [] } };
    });

    const service = {
      searchAnalytics,
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      startDate: '2026-03-01',
      endDate: '2026-03-28',
      profile: 'content',
      reportPack: 'monthly_seo',
      reportFormat: 'all',
      detailMode: 'both',
      brand: {
        name: 'Nth Agency',
        accentColor: '#0F172A',
      },
    });

    const payload = parseResult(result);
    const report = payload.report as Record<string, unknown>;
    const monthlySeo = (report.sections as Record<string, unknown>).monthlySeo as Record<string, unknown>;
    const kpiSummary = monthlySeo.kpiSummary as Array<Record<string, unknown>>;
    const requestBodies = searchAnalytics.mock.calls.map(([, body]) => body as Record<string, unknown>);
    const dateBodies = requestBodies.filter((body) => Array.isArray(body.dimensions) && body.dimensions.join(',') === 'date');

    expect(report.pack).toEqual(
      expect.objectContaining({
        name: 'monthly_seo',
        headline: 'Monthly SEO update pack',
        cadence: 'monthly',
        primaryAudience: 'client',
      }),
    );
    expect(kpiSummary).toEqual(expect.any(Array));
    expect(kpiSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Average Position',
          delta: -1.5,
          direction: 'down',
        }),
      ]),
    );
    expect(monthlySeo.popularSearches).toEqual(expect.objectContaining({ topQueries: expect.any(Array) }));
    expect(monthlySeo.topPages).toEqual(expect.objectContaining({ topPages: expect.any(Array) }));
    expect(monthlySeo.brandPerformance).toEqual(expect.any(Array));
    expect(dateBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          startDate: '2026-03-01',
          endDate: '2026-03-28',
          rowLimit: 28,
        }),
        expect.objectContaining({
          startDate: '2026-02-01',
          endDate: '2026-02-28',
          rowLimit: 28,
        }),
      ]),
    );
    expect(String(payload.markdownReport)).toContain('## KPI Summary');
    expect(String(payload.markdownReport)).toContain('## Popular Searches');
    expect(String(payload.markdownReport)).toContain('## Brand vs Non-Brand Performance');
    expect(String(payload.markdownReport)).toContain('## Analyst Appendix');
    expect(String(payload.htmlReport)).toContain('Month-over-Month Summary');
    expect(String(payload.htmlReport)).toContain('Popular Searches');
    expect(String(payload.htmlReport)).toContain('Top Pages');
    expect(String(payload.htmlReport)).toContain('Next Month Priorities');
    expect(String(payload.htmlReport)).toContain('Analyst Appendix');
    expect(String(payload.htmlReport)).not.toContain('Prioritized Actions');
  });

  it('keeps monthly SEO report renderable when comparison data is empty', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: { rows: [] },
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      profile: 'content',
      reportPack: 'monthly_seo',
      reportFormat: 'all',
    });

    const payload = parseResult(result);
    const report = payload.report as Record<string, unknown>;
    const monthlySeo = (report.sections as Record<string, unknown>).monthlySeo as Record<string, unknown>;

    expect(monthlySeo.kpiSummary).toEqual(expect.any(Array));
    expect(monthlySeo.brandPerformance).toEqual([]);
    expect(String(payload.markdownReport)).toContain('No notable movement in this section for the selected period.');
    expect(String(payload.htmlReport)).toContain('No notable movement in this section for the selected period.');
    expect(String(payload.htmlReport)).toContain('Analyst Appendix');
  });

  it('keeps the monthly renderer active when monthly enrichment fails in client mode', async () => {
    const service = {
      searchAnalytics: vi.fn().mockImplementation((_, body: { dimensions?: string[] }) => {
        if (body.dimensions?.join(',') === 'date') {
          return Promise.reject(new Error('month data offline'));
        }
        return Promise.resolve({
          data: { rows: [] },
        });
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      profile: 'content',
      reportPack: 'monthly_seo',
      reportFormat: 'all',
      detailMode: 'client',
    });

    const payload = parseResult(result);
    const report = payload.report as Record<string, unknown>;
    const monthlySeo = (report.sections as Record<string, unknown>).monthlySeo as Record<string, unknown>;

    expect(monthlySeo.note).toBe(
      'Monthly performance comparison could not be generated for this run. The workflow appendix is included below for follow-up.',
    );
    expect(String(payload.markdownReport)).toContain('## Report Note');
    expect(String(payload.markdownReport)).toContain('## KPI Summary');
    expect(String(payload.markdownReport)).not.toContain('## Executive Summary');
    expect(String(payload.htmlReport)).toContain('Report Note');
    expect(String(payload.htmlReport)).toContain('Monthly KPI summary was not available for this run.');
    expect(String(payload.htmlReport)).not.toContain('month data offline');
    expect(payload.analystSummary).toBeUndefined();
  });

  it('returns htmlReport only when reportFormat=html', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: { rows: [] },
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      profile: 'content',
      reportFormat: 'html',
      brand: {
        name: 'Nth Agency',
        accentColor: '#0F172A',
      },
    });

    const payload = parseResult(result);
    expect(payload.reportFormat).toBe('html');
    expect(payload.markdownReport).toBeUndefined();
    expect(typeof payload.htmlReport).toBe('string');
    expect(String(payload.htmlReport)).toContain('Standard content workflow handoff without a report-pack preset.');
    expect(String(payload.htmlReport)).toContain('Nth Agency');
    expect(payload.analystSummary).toBeUndefined();
    expect(payload.clientSummary).toEqual(expect.any(Array));
    expect((payload.report as Record<string, unknown>).meta).toEqual(
      expect.objectContaining({
        format: 'html',
      }),
    );
  });

  it('keeps markdown alias working when reportFormat is omitted', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: { rows: [] },
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      profile: 'content',
      markdown: true,
    });

    const payload = parseResult(result);
    expect(payload.reportFormat).toBe('markdown');
    expect(typeof payload.markdownReport).toBe('string');
    expect((payload.report as Record<string, unknown>).meta).toEqual(
      expect.objectContaining({
        format: 'markdown',
        detailMode: 'client',
      }),
    );
  });

  it('lets reportFormat override the legacy markdown flag', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: { rows: [] },
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      profile: 'content',
      reportFormat: 'json',
      markdown: true,
    });

    const payload = parseResult(result);
    expect(payload.reportFormat).toBe('json');
    expect(payload.markdownReport).toBeUndefined();
    expect((payload.report as Record<string, unknown>).meta).toEqual(
      expect.objectContaining({
        format: 'json',
      }),
    );
  });

  it('escapes HTML-sensitive brand values in html output', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: { rows: [] },
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 7,
      profile: 'content',
      reportFormat: 'html',
      brand: {
        name: 'Nth <Agency>',
        accentColor: '#0F172A',
      },
    });

    const payload = parseResult(result);
    expect(String(payload.htmlReport)).toContain('Nth &lt;Agency&gt;');
    expect(String(payload.htmlReport)).not.toContain('Nth <Agency>');
  });

  it('keeps analyst-only detail out of client mode payloads', async () => {
    const service = {
      searchAnalytics: vi
        .fn()
        .mockResolvedValueOnce({
          data: { rows: [] },
        })
        .mockResolvedValueOnce({
          data: { rows: [] },
        })
        .mockResolvedValueOnce({
          data: { rows: [] },
        }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      profile: 'content',
      detailMode: 'client',
    });

    const payload = parseResult(result);
    expect(payload.analystSummary).toBeUndefined();
    expect((payload.actions as Array<Record<string, unknown>>).every((item) => !('analystDetail' in item))).toBe(
      true,
    );
    expect((payload.issues as Array<Record<string, unknown>>).every((item) => !('analystDetail' in item))).toBe(
      true,
    );
  });

  it('keeps workflow valid when one step fails', async () => {
    const service = {
      searchAnalytics: vi
        .fn()
        .mockResolvedValueOnce({
          data: { rows: [{ keys: ['q1', 'https://example.com/a'], clicks: 1, impressions: 200, ctr: 0.01, position: 5 }] },
        })
        .mockRejectedValueOnce(new Error('analytics down'))
        .mockResolvedValueOnce({
          data: { rows: [{ keys: ['q2', 'https://example.com/b'], clicks: 5, impressions: 500, ctr: 0.02, position: 6 }] },
        }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      profile: 'content',
    });

    const payload = parseResult(result);
    const steps = payload.steps as Array<Record<string, unknown>>;
    const statuses = steps.map((step) => step.status);

    expect(statuses).toContain('error');
    expect(statuses).toContain('success');
    expect((payload.executiveSummary as Record<string, unknown>).overallStatus).toBe('partial');
  });

  it('sanitizes client-facing error summaries in rendered reports', async () => {
    const service = {
      searchAnalytics: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            rows: [{ keys: ['q1', 'https://example.com/a'], clicks: 1, impressions: 200, ctr: 0.01, position: 5 }],
          },
        })
        .mockRejectedValueOnce(new Error('analytics token secret-leak'))
        .mockResolvedValueOnce({
          data: {
            rows: [{ keys: ['q2', 'https://example.com/b'], clicks: 5, impressions: 500, ctr: 0.02, position: 6 }],
          },
        }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      profile: 'content',
      detailMode: 'client',
      reportFormat: 'all',
    });

    const payload = parseResult(result);
    const issues = payload.issues as Array<Record<string, unknown>>;

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clientSummary: 'One workflow step failed and needs analyst follow-up.',
        }),
      ]),
    );
    expect(payload.analystSummary).toBeUndefined();
    expect(String(payload.markdownReport)).toContain(
      'One workflow step failed and needs analyst follow-up.',
    );
    expect(String(payload.htmlReport)).toContain(
      'One workflow step failed and needs analyst follow-up.',
    );
    expect(String(payload.markdownReport)).not.toContain('secret-leak');
    expect(String(payload.htmlReport)).not.toContain('secret-leak');
  });

  it('uses explicit date ranges consistently across workflow steps', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: {
          rows: [],
        },
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.7 } } } },
      }),
    } as unknown as SearchConsoleService;

    await handleRunSeoAuditWorkflow(service, {
      siteUrl: 'sc-domain:example.com',
      startDate: '2026-01-01',
      endDate: '2026-01-28',
      profile: 'content',
    });

    const calls = (service.searchAnalytics as ReturnType<typeof vi.fn>).mock.calls;
    const requestBodies = calls.map(([, body]) => body as Record<string, unknown>);

    expect(requestBodies).toContainEqual(
      expect.objectContaining({
        startDate: '2026-01-01',
        endDate: '2026-01-28',
      }),
    );
    expect(requestBodies).toContainEqual(
      expect.objectContaining({
        startDate: '2026-01-15',
        endDate: '2026-01-28',
      }),
    );
    expect(requestBodies).toContainEqual(
      expect.objectContaining({
        startDate: '2026-01-01',
        endDate: '2026-01-14',
      }),
    );
  });
});
