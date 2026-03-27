import { describe, it, expect, vi } from 'vitest';
import { handleCannibalizationResolver } from '../src/tools/computed2.js';
import type { SearchConsoleService } from '../src/service.js';
import type { ToolResult } from '../src/utils/types.js';

function parseResult(result: ToolResult): Record<string, unknown> {
  return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
}

describe('cannibalization_resolver', () => {
  it('adds intent, segment, template, and stronger action metadata', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: {
          rows: [
            {
              keys: ['nth crm pricing', 'https://example.com/pricing'],
              clicks: 80,
              impressions: 1400,
              ctr: 0.057,
              position: 2.8,
            },
            {
              keys: ['nth crm pricing', 'https://example.com/blog/crm-pricing'],
              clicks: 20,
              impressions: 900,
              ctr: 0.022,
              position: 8.7,
            },
            {
              keys: ['crm implementation checklist', 'https://example.com/blog/checklist'],
              clicks: 35,
              impressions: 700,
              ctr: 0.05,
              position: 4.4,
            },
            {
              keys: ['crm implementation checklist', 'https://example.com/docs/checklist'],
              clicks: 28,
              impressions: 680,
              ctr: 0.041,
              position: 5.1,
            },
          ],
        },
      }),
    } as unknown as SearchConsoleService;

    const payload = parseResult(
      await handleCannibalizationResolver(service, {
        siteUrl: 'sc-domain:example.com',
        days: 28,
        minImpressions: 100,
        brandTerms: ['nth'],
      }),
    );

    expect(payload.brandTermsUsed).toEqual(expect.arrayContaining(['nth', 'example']));
    expect(payload.segmentationSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ segment: 'branded' }),
        expect.objectContaining({ segment: 'non_branded' }),
      ]),
    );

    const queries = payload.queries as Array<Record<string, unknown>>;
    expect(queries[0]).toEqual(
      expect.objectContaining({
        intent: expect.any(String),
        cluster: expect.any(String),
        brandSegment: expect.any(String),
        severity: expect.any(String),
        templates: expect.any(Array),
      }),
    );

    const recommendation = queries[0]?.recommendation as Record<string, unknown>;
    expect(recommendation).toEqual(
      expect.objectContaining({
        winnerTemplate: expect.any(String),
        severity: expect.any(String),
      }),
    );
    expect(recommendation.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          template: expect.any(String),
          owner: expect.any(String),
          impact: expect.any(String),
          actionPriority: expect.any(String),
        }),
      ]),
    );
  });
});
