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

  it('uses monthly SEO pack context for compatible content workflows', async () => {
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
      reportPack: 'monthly_seo',
      reportFormat: 'markdown',
    });

    const payload = parseResult(result);
    expect((payload.report as Record<string, unknown>).pack).toEqual(
      expect.objectContaining({
        name: 'monthly_seo',
        headline: 'Monthly SEO update pack',
        cadence: 'monthly',
        primaryAudience: 'client',
      }),
    );
    expect(String(payload.markdownReport)).toContain('Pack Headline: Monthly SEO update pack');
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
