import { describe, it, expect } from 'vitest';
import {
  PageHealthDashboardSchema,
  IndexingHealthReportSchema,
  SerpFeatureTrackingSchema,
  CannibalizationResolverSchema,
  DropAlertsSchema,
} from '../src/schemas/computed2.js';

describe('PageHealthDashboardSchema', () => {
  it('requires siteUrl and url', () => {
    expect(() => PageHealthDashboardSchema.parse({})).toThrow();
    expect(() =>
      PageHealthDashboardSchema.parse({ siteUrl: 'sc-domain:example.com' }),
    ).toThrow();
  });

  it('parses with defaults', () => {
    const result = PageHealthDashboardSchema.parse({
      siteUrl: 'sc-domain:example.com',
      url: 'https://example.com/page',
      days: 28,
    });
    expect(result.strategy).toBe('mobile');
    expect(result.categories).toEqual(['performance']);
    expect(result.languageCode).toBe('en-US');
  });

  it('accepts explicit date range', () => {
    const result = PageHealthDashboardSchema.parse({
      siteUrl: 'sc-domain:example.com',
      url: 'https://example.com/page',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    expect(result.startDate).toBe('2026-01-01');
    expect(result.endDate).toBe('2026-01-31');
  });

  it('accepts desktop strategy and multiple categories', () => {
    const result = PageHealthDashboardSchema.parse({
      siteUrl: 'sc-domain:example.com',
      url: 'https://example.com/page',
      days: 7,
      strategy: 'desktop',
      categories: ['performance', 'seo', 'accessibility'],
    });
    expect(result.strategy).toBe('desktop');
    expect(result.categories).toEqual(['performance', 'seo', 'accessibility']);
  });

  it('rejects empty categories array', () => {
    expect(() =>
      PageHealthDashboardSchema.parse({
        siteUrl: 'sc-domain:example.com',
        url: 'https://example.com/page',
        days: 7,
        categories: [],
      }),
    ).toThrow();
  });

  it('rejects malformed URL', () => {
    expect(() =>
      PageHealthDashboardSchema.parse({
        siteUrl: 'sc-domain:example.com',
        url: 'not-a-url',
        days: 7,
      }),
    ).toThrow(/fully-qualified URL/);
  });

  it('rejects invalid strategy', () => {
    expect(() =>
      PageHealthDashboardSchema.parse({
        siteUrl: 'sc-domain:example.com',
        url: 'https://example.com/page',
        days: 7,
        strategy: 'tablet',
      }),
    ).toThrow();
  });
});

describe('IndexingHealthReportSchema', () => {
  it('requires siteUrl', () => {
    expect(() => IndexingHealthReportSchema.parse({})).toThrow();
  });

  it('defaults source to analytics, topN to 50', () => {
    const result = IndexingHealthReportSchema.parse({
      siteUrl: 'sc-domain:example.com',
      days: 28,
    });
    expect(result.source).toBe('analytics');
    expect(result.topN).toBe(50);
    expect(result.languageCode).toBe('en-US');
  });

  it('rejects topN > 100', () => {
    expect(() =>
      IndexingHealthReportSchema.parse({
        siteUrl: 'sc-domain:example.com',
        days: 28,
        topN: 200,
      }),
    ).toThrow();
  });

  it('rejects topN < 1', () => {
    expect(() =>
      IndexingHealthReportSchema.parse({
        siteUrl: 'sc-domain:example.com',
        days: 28,
        topN: 0,
      }),
    ).toThrow();
  });

  it('rejects sitemaps source (not yet implemented)', () => {
    expect(() =>
      IndexingHealthReportSchema.parse({
        siteUrl: 'sc-domain:example.com',
        days: 28,
        source: 'sitemaps',
      }),
    ).toThrow();
  });

  it('rejects both source (not yet implemented)', () => {
    expect(() =>
      IndexingHealthReportSchema.parse({
        siteUrl: 'sc-domain:example.com',
        days: 28,
        source: 'both',
      }),
    ).toThrow();
  });
});

describe('SerpFeatureTrackingSchema', () => {
  it('requires siteUrl', () => {
    expect(() => SerpFeatureTrackingSchema.parse({})).toThrow();
  });

  it('defaults rowLimit to 5000', () => {
    const result = SerpFeatureTrackingSchema.parse({
      siteUrl: 'sc-domain:example.com',
      days: 28,
    });
    expect(result.rowLimit).toBe(5000);
  });

  it('rejects rowLimit > 25000', () => {
    expect(() =>
      SerpFeatureTrackingSchema.parse({
        siteUrl: 'sc-domain:example.com',
        days: 28,
        rowLimit: 30000,
      }),
    ).toThrow();
  });

  it('accepts explicit date range', () => {
    const result = SerpFeatureTrackingSchema.parse({
      siteUrl: 'sc-domain:example.com',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      rowLimit: 1000,
    });
    expect(result.startDate).toBe('2026-01-01');
    expect(result.rowLimit).toBe(1000);
  });
});

describe('CannibalizationResolverSchema', () => {
  it('defaults includeRecommendation to true', () => {
    const result = CannibalizationResolverSchema.parse({
      siteUrl: 'sc-domain:example.com',
      days: 28,
    });
    expect(result.includeRecommendation).toBe(true);
    expect(result.minImpressions).toBe(10);
    expect(result.rowLimit).toBe(10000);
  });

  it('accepts includeRecommendation false', () => {
    const result = CannibalizationResolverSchema.parse({
      siteUrl: 'sc-domain:example.com',
      days: 28,
      includeRecommendation: false,
    });
    expect(result.includeRecommendation).toBe(false);
  });

  it('accepts custom minImpressions', () => {
    const result = CannibalizationResolverSchema.parse({
      siteUrl: 'sc-domain:example.com',
      days: 14,
      minImpressions: 100,
    });
    expect(result.minImpressions).toBe(100);
  });
});

describe('DropAlertsSchema', () => {
  it('requires siteUrl', () => {
    expect(() => DropAlertsSchema.parse({})).toThrow();
  });

  it('defaults threshold to 50, minClicks to 10, days to 7', () => {
    const result = DropAlertsSchema.parse({
      siteUrl: 'sc-domain:example.com',
    });
    expect(result.threshold).toBe(50);
    expect(result.minClicks).toBe(10);
    expect(result.days).toBe(7);
    expect(result.rowLimit).toBe(5000);
  });

  it('rejects threshold > 100', () => {
    expect(() =>
      DropAlertsSchema.parse({
        siteUrl: 'sc-domain:example.com',
        threshold: 150,
      }),
    ).toThrow();
  });

  it('rejects threshold < 1', () => {
    expect(() =>
      DropAlertsSchema.parse({
        siteUrl: 'sc-domain:example.com',
        threshold: 0,
      }),
    ).toThrow();
  });

  it('accepts custom values', () => {
    const result = DropAlertsSchema.parse({
      siteUrl: 'sc-domain:example.com',
      threshold: 30,
      minClicks: 5,
      days: 14,
      rowLimit: 10000,
    });
    expect(result.threshold).toBe(30);
    expect(result.minClicks).toBe(5);
    expect(result.days).toBe(14);
    expect(result.rowLimit).toBe(10000);
  });

  it('rejects days > 90', () => {
    expect(() =>
      DropAlertsSchema.parse({
        siteUrl: 'sc-domain:example.com',
        days: 100,
      }),
    ).toThrow();
  });

  it('does not accept startDate/endDate (uses comparePeriods, not DateRangeSchema)', () => {
    const result = DropAlertsSchema.parse({
      siteUrl: 'sc-domain:example.com',
      days: 7,
    });
    // DropAlertsSchema does not have startDate/endDate fields
    expect(result).not.toHaveProperty('startDate');
    expect(result).not.toHaveProperty('endDate');
  });
});

// ---------------------------------------------------------------------------
// Handler logic tests (recommendation algorithm + drop calculation)
// ---------------------------------------------------------------------------

describe('Cannibalization recommendation algorithm', () => {
  // Extracted logic mirrors computed2.ts handleCannibalizationResolver
  function classifyAction(
    winnerClicks: number,
    loserClicks: number,
    winnerPosition: number,
    loserPosition: number,
  ): string {
    const clickRatio = winnerClicks > 0 ? loserClicks / winnerClicks : 0;
    const posGap = loserPosition - winnerPosition;

    if (clickRatio < 0.1 && posGap > 5) return 'redirect';
    if (clickRatio < 0.3) return 'consolidate';
    return 'differentiate';
  }

  it('recommends redirect for low traffic + poor position', () => {
    // <10% clicks, >5 positions worse
    expect(classifyAction(100, 5, 3, 15)).toBe('redirect');
    expect(classifyAction(200, 10, 2, 20)).toBe('redirect');
  });

  it('recommends consolidate for moderate traffic', () => {
    // <30% clicks (but not <10% + >5 posGap)
    expect(classifyAction(100, 20, 3, 5)).toBe('consolidate');
    expect(classifyAction(100, 29, 3, 4)).toBe('consolidate');
  });

  it('recommends differentiate for significant traffic', () => {
    // >=30% clicks
    expect(classifyAction(100, 30, 3, 5)).toBe('differentiate');
    expect(classifyAction(100, 80, 2, 4)).toBe('differentiate');
  });

  it('consolidate wins over redirect when position gap <= 5', () => {
    // <10% clicks but posGap <= 5 → consolidate, not redirect
    expect(classifyAction(100, 5, 3, 8)).toBe('consolidate');
    expect(classifyAction(100, 9, 3, 3)).toBe('consolidate');
  });

  it('handles zero winner clicks (clickRatio = 0)', () => {
    // winner has 0 clicks → clickRatio = 0 → redirect if posGap > 5
    expect(classifyAction(0, 0, 10, 20)).toBe('redirect');
    // winner has 0 clicks but posGap <= 5 → consolidate
    expect(classifyAction(0, 0, 10, 12)).toBe('consolidate');
  });
});

describe('Drop percentage calculation', () => {
  function calcDropPct(clicksPrior: number, clicksRecent: number): number {
    return clicksPrior > 0
      ? Number((((clicksPrior - clicksRecent) / clicksPrior) * 100).toFixed(1))
      : 0;
  }

  it('calculates 100% drop for complete disappearance', () => {
    expect(calcDropPct(100, 0)).toBe(100);
  });

  it('calculates 50% drop correctly', () => {
    expect(calcDropPct(100, 50)).toBe(50);
  });

  it('calculates negative drop (growth) correctly', () => {
    // Page gained traffic — negative drop, won't trigger alert
    expect(calcDropPct(100, 150)).toBe(-50);
  });

  it('returns 0 when prior clicks are 0', () => {
    expect(calcDropPct(0, 100)).toBe(0);
  });

  it('handles fractional drops', () => {
    expect(calcDropPct(3, 1)).toBe(66.7);
  });
});
