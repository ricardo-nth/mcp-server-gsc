import { describe, it, expect } from 'vitest';
import {
  SearchAnalyticsSchema,
  EnhancedSearchAnalyticsSchema,
  QuickWinsSchema,
} from '../src/schemas/analytics.js';
import { IndexInspectSchema } from '../src/schemas/inspection.js';
import {
  ListSitemapsSchema,
  GetSitemapSchema,
  SubmitSitemapSchema,
  DeleteSitemapSchema,
} from '../src/schemas/sitemaps.js';

describe('SearchAnalyticsSchema', () => {
  it('parses minimal valid input', () => {
    const result = SearchAnalyticsSchema.parse({
      siteUrl: 'sc-domain:example.com',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
    });
    expect(result.siteUrl).toBe('sc-domain:example.com');
    expect(result.rowLimit).toBe(1000); // default
  });

  it('parses full input with all optional fields', () => {
    const result = SearchAnalyticsSchema.parse({
      siteUrl: 'sc-domain:example.com',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      dimensions: ['query', 'page'],
      type: 'web',
      aggregationType: 'byPage',
      dataState: 'all',
      rowLimit: 5000,
      startRow: 0,
      pageFilter: 'https://example.com/blog',
      queryFilter: 'typescript',
      countryFilter: 'USA',
      deviceFilter: 'MOBILE',
      filterOperator: 'contains',
    });
    expect(result.dimensions).toEqual(['query', 'page']);
    expect(result.type).toBe('web');
    expect(result.dataState).toBe('all');
    expect(result.rowLimit).toBe(5000);
  });

  it('accepts discover and googleNews search types', () => {
    const result = SearchAnalyticsSchema.parse({
      siteUrl: 'sc-domain:example.com',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      type: 'discover',
    });
    expect(result.type).toBe('discover');
  });

  it('rejects invalid search type', () => {
    expect(() =>
      SearchAnalyticsSchema.parse({
        siteUrl: 'sc-domain:example.com',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        type: 'invalid',
      }),
    ).toThrow();
  });

  it('rejects rowLimit > 25000', () => {
    expect(() =>
      SearchAnalyticsSchema.parse({
        siteUrl: 'sc-domain:example.com',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        rowLimit: 30000,
      }),
    ).toThrow();
  });

  it('rejects invalid dimension', () => {
    expect(() =>
      SearchAnalyticsSchema.parse({
        siteUrl: 'sc-domain:example.com',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        dimensions: ['invalid'],
      }),
    ).toThrow();
  });

  it('rejects invalid date format', () => {
    expect(() =>
      SearchAnalyticsSchema.parse({
        siteUrl: 'sc-domain:example.com',
        startDate: '2025/01/01',
        endDate: '2025-01-31',
      }),
    ).toThrow();
  });
});

describe('EnhancedSearchAnalyticsSchema', () => {
  it('extends SearchAnalyticsSchema with quick wins', () => {
    const result = EnhancedSearchAnalyticsSchema.parse({
      siteUrl: 'sc-domain:example.com',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      enableQuickWins: true,
      quickWinsThresholds: {
        minImpressions: 100,
        maxCtr: 1.5,
        positionRangeMin: 3,
        positionRangeMax: 8,
      },
    });
    expect(result.enableQuickWins).toBe(true);
    expect(result.quickWinsThresholds?.minImpressions).toBe(100);
  });

  it('accepts regex filter', () => {
    const result = EnhancedSearchAnalyticsSchema.parse({
      siteUrl: 'sc-domain:example.com',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      regexFilter: 'typescript|javascript',
    });
    expect(result.regexFilter).toBe('typescript|javascript');
  });

  it('defaults maxRows to 25000', () => {
    const result = EnhancedSearchAnalyticsSchema.parse({
      siteUrl: 'sc-domain:example.com',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
    });
    expect(result.maxRows).toBe(25000);
  });

  it('rejects maxRows above 100000', () => {
    expect(() =>
      EnhancedSearchAnalyticsSchema.parse({
        siteUrl: 'sc-domain:example.com',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        maxRows: 100001,
      }),
    ).toThrow();
  });
});

describe('QuickWinsSchema', () => {
  it('provides defaults for thresholds', () => {
    const result = QuickWinsSchema.parse({
      siteUrl: 'sc-domain:example.com',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
    });
    expect(result.minImpressions).toBe(50);
    expect(result.maxCtr).toBe(2.0);
    expect(result.positionRangeMin).toBe(4);
    expect(result.positionRangeMax).toBe(10);
    expect(result.maxRows).toBe(25000);
  });
});

describe('IndexInspectSchema', () => {
  it('parses with defaults', () => {
    const result = IndexInspectSchema.parse({
      siteUrl: 'sc-domain:example.com',
      inspectionUrl: 'https://example.com/page',
    });
    expect(result.languageCode).toBe('en-US');
  });

  it('rejects invalid inspection URLs', () => {
    expect(() =>
      IndexInspectSchema.parse({
        siteUrl: 'sc-domain:example.com',
        inspectionUrl: 'not-a-url',
      }),
    ).toThrow(/fully-qualified URL/);
  });
});

describe('Sitemap schemas', () => {
  it('ListSitemapsSchema requires siteUrl', () => {
    expect(() => ListSitemapsSchema.parse({})).toThrow();
    expect(() =>
      ListSitemapsSchema.parse({ siteUrl: 'https://example.com/' }),
    ).not.toThrow();
  });

  it('GetSitemapSchema requires siteUrl and feedpath', () => {
    expect(() => GetSitemapSchema.parse({})).toThrow();
    expect(() =>
      GetSitemapSchema.parse({ siteUrl: 'https://example.com/' }),
    ).toThrow();
    const result = GetSitemapSchema.parse({
      siteUrl: 'https://example.com/',
      feedpath: 'https://example.com/sitemap.xml',
    });
    expect(result.feedpath).toBe('https://example.com/sitemap.xml');
  });

  it('SubmitSitemapSchema requires both fields', () => {
    expect(() => SubmitSitemapSchema.parse({})).toThrow();
    expect(() =>
      SubmitSitemapSchema.parse({
        siteUrl: 'https://example.com/',
        feedpath: 'https://example.com/sitemap.xml',
      }),
    ).not.toThrow();
  });

  it('DeleteSitemapSchema requires both fields', () => {
    expect(() => DeleteSitemapSchema.parse({})).toThrow();
    expect(() =>
      DeleteSitemapSchema.parse({
        siteUrl: 'https://example.com/',
        feedpath: 'https://example.com/sitemap.xml',
      }),
    ).not.toThrow();
  });
});
