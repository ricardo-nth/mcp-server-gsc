import { describe, it, expect, vi } from 'vitest';
import { handleRunSeoAuditWorkflow } from '../src/tools/workflow.js';
import type { SearchConsoleService } from '../src/service.js';
import type { ToolResult } from '../src/utils/types.js';

function parseResult(result: ToolResult): Record<string, unknown> {
  return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
}

describe('run_seo_audit_workflow', () => {
  it('returns markdown report and per-step statuses for technical profile', async () => {
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
      markdown: true,
    });

    const payload = parseResult(result);
    expect(payload.profile).toBe('technical');
    expect((payload.steps as Array<unknown>).length).toBeGreaterThan(1);
    expect(typeof payload.markdownReport).toBe('string');
    expect((payload.executiveSummary as Record<string, unknown>).stepsSucceeded).toBeGreaterThan(0);
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
});
