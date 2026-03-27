import { describe, it, expect, vi } from 'vitest';
import { handleRecommendNextActions } from '../src/tools/recommendations.js';
import type { SearchConsoleService } from '../src/service.js';
import type { ToolResult } from '../src/utils/types.js';

function parseResult(result: ToolResult): Record<string, unknown> {
  return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
}

describe('recommend_next_actions', () => {
  it('returns deterministic ranking with score, confidence, impact, and rationale', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: {
          rows: [
            {
              keys: ['best crm software', 'https://example.com/crm'],
              clicks: 20,
              impressions: 1200,
              ctr: 0.016,
              position: 6.2,
            },
            {
              keys: ['seo checklist', 'https://example.com/seo-checklist'],
              clicks: 12,
              impressions: 600,
              ctr: 0.02,
              position: 8.5,
            },
          ],
        },
      }),
      indexInspect: vi.fn().mockImplementation(async (requestBody: { inspectionUrl: string }) => {
        if (requestBody.inspectionUrl.includes('/crm')) {
          return {
            data: {
              inspectionResult: {
                indexStatusResult: {
                  verdict: 'FAIL',
                  coverageState: 'Discovered - currently not indexed',
                },
              },
            },
          };
        }
        return {
          data: {
            inspectionResult: {
              indexStatusResult: {
                verdict: 'PASS',
                coverageState: 'Submitted and indexed',
              },
            },
          },
        };
      }),
      runPageSpeed: vi.fn().mockImplementation(async (params: { url: string }) => {
        if (params.url.includes('/crm')) {
          return { data: { lighthouseResult: { categories: { performance: { score: 0.42 } } } } };
        }
        return { data: { lighthouseResult: { categories: { performance: { score: 0.88 } } } } };
      }),
    } as unknown as SearchConsoleService;

    const args = {
      siteUrl: 'sc-domain:example.com',
      days: 28,
      topActions: 2,
      minImpressions: 100,
      includeCwv: true,
    };

    const first = parseResult(await handleRecommendNextActions(service, args));
    const second = parseResult(await handleRecommendNextActions(service, args));

    const recommendationsA = first.recommendations as Array<Record<string, unknown>>;
    const recommendationsB = second.recommendations as Array<Record<string, unknown>>;

    expect(recommendationsA).toEqual(recommendationsB);
    expect(recommendationsA[0]?.score).toBeTypeOf('number');
    expect(recommendationsA[0]?.confidence).toBeTypeOf('number');
    expect(['low', 'medium', 'high']).toContain(recommendationsA[0]?.impact);
    expect(Array.isArray(recommendationsA[0]?.rationale)).toBe(true);
    expect(recommendationsA[0]?.reasonFields).toBeDefined();
    expect(['branded', 'non_branded']).toContain(recommendationsA[0]?.brandSegment);
    expect(recommendationsA[0]?.pageTemplate).toBeTypeOf('string');
    expect(first.segmentationSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          segment: 'non_branded',
        }),
      ]),
    );
    expect(first.templateGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          template: 'other',
        }),
      ]),
    );
  });

  it('derives branded segmentation from explicit brand terms and groups by template', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: {
          rows: [
            {
              keys: ['nth crm pricing', 'https://example.com/pricing'],
              clicks: 18,
              impressions: 500,
              ctr: 0.036,
              position: 4.8,
            },
            {
              keys: ['best crm platform', 'https://example.com/blog/crm-guide'],
              clicks: 10,
              impressions: 900,
              ctr: 0.011,
              position: 7.1,
            },
          ],
        },
      }),
      indexInspect: vi.fn().mockResolvedValue({
        data: {
          inspectionResult: {
            indexStatusResult: {
              verdict: 'PASS',
              coverageState: 'Submitted and indexed',
            },
          },
        },
      }),
      runPageSpeed: vi.fn().mockResolvedValue({
        data: { lighthouseResult: { categories: { performance: { score: 0.88 } } } },
      }),
    } as unknown as SearchConsoleService;

    const result = parseResult(
      await handleRecommendNextActions(service, {
        siteUrl: 'sc-domain:example.com',
        days: 28,
        topActions: 2,
        minImpressions: 100,
        includeCwv: true,
        brandTerms: ['nth'],
      }),
    );

    expect(result.brandTermsUsed).toEqual(expect.arrayContaining(['nth', 'example']));
    expect(result.segmentationSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ segment: 'branded', opportunities: 1 }),
        expect.objectContaining({ segment: 'non_branded', opportunities: 1 }),
      ]),
    );
    expect(result.templateGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ template: 'product', brandedOpportunities: 1 }),
        expect.objectContaining({ template: 'blog', nonBrandedOpportunities: 1 }),
      ]),
    );
  });

  it('returns a stable empty response shape and skips multipart tld suffixes in derived brand terms', async () => {
    const service = {
      searchAnalytics: vi.fn().mockResolvedValue({
        data: {
          rows: [],
        },
      }),
      indexInspect: vi.fn(),
      runPageSpeed: vi.fn(),
    } as unknown as SearchConsoleService;

    const result = parseResult(
      await handleRecommendNextActions(service, {
        siteUrl: 'sc-domain:example.com.au',
        days: 28,
        topActions: 5,
        minImpressions: 100,
      }),
    );

    expect(result.siteUrl).toBe('sc-domain:example.com.au');
    expect(result.analyzedRows).toBe(0);
    expect(result.diagnosticsPagesChecked).toBe(0);
    expect(result.brandTermsUsed).toContain('example');
    expect(result.brandTermsUsed).not.toContain('com');
    expect(result.segmentationSummary).toEqual([]);
    expect(result.templateGroups).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });
});
