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

  it('accepts all source values', () => {
    for (const source of ['sitemaps', 'analytics', 'both'] as const) {
      const result = IndexingHealthReportSchema.parse({
        siteUrl: 'sc-domain:example.com',
        days: 28,
        source,
      });
      expect(result.source).toBe(source);
    }
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
});
