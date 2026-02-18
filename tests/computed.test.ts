import { describe, it, expect } from 'vitest';
import {
  formatDate,
  relativeDateRange,
  resolveDateRange,
  comparePeriods,
  rollingWindows,
} from '../src/utils/dates.js';
import {
  ComparePeriodsSchema,
  ContentDecaySchema,
  CannibalizationSchema,
  DiffKeywordsSchema,
  BatchInspectSchema,
  CtrAnalysisSchema,
  SearchTypeBreakdownSchema,
} from '../src/schemas/computed.js';

describe('Date utilities', () => {
  it('formatDate returns YYYY-MM-DD', () => {
    expect(formatDate(new Date('2025-03-15'))).toBe('2025-03-15');
  });

  it('relativeDateRange returns correct span (days inclusive)', () => {
    const range = relativeDateRange(7);
    const start = new Date(range.startDate);
    const end = new Date(range.endDate);
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    // 7 days inclusive = 6 day diff between start and end
    expect(diff).toBe(6);
  });

  it('comparePeriods returns two non-overlapping periods', () => {
    const { periodA, periodB } = comparePeriods(14);
    // Period B should end before period A starts
    expect(new Date(periodB.endDate) < new Date(periodA.startDate)).toBe(true);
    // Each period should span 14 days
    const spanA =
      (new Date(periodA.endDate).getTime() -
        new Date(periodA.startDate).getTime()) /
      (1000 * 60 * 60 * 24);
    const spanB =
      (new Date(periodB.endDate).getTime() -
        new Date(periodB.startDate).getTime()) /
      (1000 * 60 * 60 * 24);
    expect(spanA).toBe(13); // 14 days inclusive = 13 day span
    expect(spanB).toBe(13);
  });

  it('rollingWindows returns chronological windows', () => {
    const windows = rollingWindows(28, 7);
    expect(windows.length).toBe(4);
    // Each should span 7 days (6 day diff)
    for (const w of windows) {
      const diff =
        (new Date(w.endDate).getTime() - new Date(w.startDate).getTime()) /
        (1000 * 60 * 60 * 24);
      expect(diff).toBe(6);
    }
    // Chronological order: first window starts earliest
    expect(new Date(windows[0].startDate) < new Date(windows[1].startDate)).toBe(
      true,
    );
  });

  it('rollingWindows with custom step', () => {
    const windows = rollingWindows(28, 7, 3);
    // With step=3, window count: floor((28-7)/3) + 1 = 8
    expect(windows.length).toBeGreaterThan(4);
  });

  it('resolveDateRange uses days when provided', () => {
    const range = resolveDateRange({ days: 7 });
    expect(range.startDate).toBeDefined();
    expect(range.endDate).toBeDefined();
  });

  it('resolveDateRange uses explicit dates when provided', () => {
    const range = resolveDateRange({ startDate: '2025-01-01', endDate: '2025-01-31' });
    expect(range.startDate).toBe('2025-01-01');
    expect(range.endDate).toBe('2025-01-31');
  });

  it('resolveDateRange throws when neither days nor dates provided', () => {
    expect(() => resolveDateRange({})).toThrow();
  });
});

describe('Computed schemas', () => {
  it('ComparePeriodsSchema defaults', () => {
    const result = ComparePeriodsSchema.parse({
      siteUrl: 'sc-domain:example.com',
    });
    expect(result.days).toBe(28);
    expect(result.rowLimit).toBe(1000);
  });

  it('ContentDecaySchema defaults', () => {
    const result = ContentDecaySchema.parse({
      siteUrl: 'sc-domain:example.com',
    });
    expect(result.days).toBe(56);
    expect(result.minClicksInPrior).toBe(10);
  });

  it('ContentDecaySchema rejects <14 days', () => {
    expect(() =>
      ContentDecaySchema.parse({ siteUrl: 'sc-domain:example.com', days: 7 }),
    ).toThrow();
  });

  it('CannibalizationSchema accepts days as alternative to dates', () => {
    const result = CannibalizationSchema.parse({
      siteUrl: 'sc-domain:example.com',
      days: 28,
    });
    expect(result.days).toBe(28);
    expect(result.startDate).toBeUndefined();
  });

  it('DiffKeywordsSchema defaults', () => {
    const result = DiffKeywordsSchema.parse({
      siteUrl: 'sc-domain:example.com',
    });
    expect(result.days).toBe(28);
    expect(result.minImpressions).toBe(5);
  });

  it('BatchInspectSchema rejects >100 URLs', () => {
    const urls = Array.from({ length: 101 }, (_, i) => `https://example.com/${i}`);
    expect(() =>
      BatchInspectSchema.parse({ siteUrl: 'sc-domain:example.com', urls }),
    ).toThrow();
  });

  it('BatchInspectSchema accepts 1-100 URLs', () => {
    const result = BatchInspectSchema.parse({
      siteUrl: 'sc-domain:example.com',
      urls: ['https://example.com/a', 'https://example.com/b'],
    });
    expect(result.urls.length).toBe(2);
    expect(result.languageCode).toBe('en-US');
  });

  it('BatchInspectSchema rejects malformed URLs in array', () => {
    expect(() =>
      BatchInspectSchema.parse({
        siteUrl: 'sc-domain:example.com',
        urls: ['https://example.com/valid', 'not-a-url'],
      }),
    ).toThrow(/fully-qualified/);
  });

  it('CtrAnalysisSchema accepts days as alternative to dates', () => {
    const result = CtrAnalysisSchema.parse({
      siteUrl: 'sc-domain:example.com',
      days: 14,
    });
    expect(result.days).toBe(14);
  });

  it('SearchTypeBreakdownSchema defaults', () => {
    const result = SearchTypeBreakdownSchema.parse({
      siteUrl: 'sc-domain:example.com',
      days: 28,
    });
    expect(result.types).toEqual(['web', 'image', 'video', 'discover', 'news']);
  });
});
