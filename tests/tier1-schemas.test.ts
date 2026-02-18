import { describe, it, expect } from 'vitest';
import { GetSiteSchema, AddSiteSchema, DeleteSiteSchema } from '../src/schemas/sites.js';
import { MobileFriendlyTestSchema } from '../src/schemas/mobilefriendly.js';
import { PageSpeedInsightsSchema } from '../src/schemas/pagespeed.js';
import { IndexingPublishSchema, IndexingStatusSchema } from '../src/schemas/indexing.js';
import { CrUXQuerySchema, CrUXHistorySchema } from '../src/schemas/crux.js';

describe('Sites CRUD schemas', () => {
  it('GetSiteSchema requires siteUrl', () => {
    expect(() => GetSiteSchema.parse({})).toThrow();
    const result = GetSiteSchema.parse({ siteUrl: 'sc-domain:example.com' });
    expect(result.siteUrl).toBe('sc-domain:example.com');
  });

  it('AddSiteSchema requires siteUrl', () => {
    expect(() => AddSiteSchema.parse({})).toThrow();
    expect(() => AddSiteSchema.parse({ siteUrl: 'https://example.com/' })).not.toThrow();
  });

  it('DeleteSiteSchema requires siteUrl', () => {
    expect(() => DeleteSiteSchema.parse({})).toThrow();
    expect(() => DeleteSiteSchema.parse({ siteUrl: 'https://example.com/' })).not.toThrow();
  });
});

describe('MobileFriendlyTestSchema', () => {
  it('requires url', () => {
    expect(() => MobileFriendlyTestSchema.parse({})).toThrow();
  });

  it('defaults requestScreenshot to false', () => {
    const result = MobileFriendlyTestSchema.parse({ url: 'https://example.com/' });
    expect(result.requestScreenshot).toBe(false);
  });

  it('accepts requestScreenshot true', () => {
    const result = MobileFriendlyTestSchema.parse({ url: 'https://example.com/', requestScreenshot: true });
    expect(result.requestScreenshot).toBe(true);
  });

  it('rejects malformed URL values', () => {
    expect(() => MobileFriendlyTestSchema.parse({ url: 'example.com/page' })).toThrow(
      /fully-qualified URL/,
    );
  });
});

describe('PageSpeedInsightsSchema', () => {
  it('requires url', () => {
    expect(() => PageSpeedInsightsSchema.parse({})).toThrow();
  });

  it('defaults categories to performance and strategy to mobile', () => {
    const result = PageSpeedInsightsSchema.parse({ url: 'https://example.com/' });
    expect(result.categories).toEqual(['performance']);
    expect(result.strategy).toBe('mobile');
  });

  it('accepts all categories', () => {
    const result = PageSpeedInsightsSchema.parse({
      url: 'https://example.com/',
      categories: ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'],
    });
    expect(result.categories).toHaveLength(5);
  });

  it('rejects invalid category', () => {
    expect(() =>
      PageSpeedInsightsSchema.parse({ url: 'https://example.com/', categories: ['invalid'] }),
    ).toThrow();
  });

  it('rejects invalid strategy', () => {
    expect(() =>
      PageSpeedInsightsSchema.parse({ url: 'https://example.com/', strategy: 'tablet' }),
    ).toThrow();
  });

  it('rejects malformed URL values', () => {
    expect(() => PageSpeedInsightsSchema.parse({ url: 'example.com/page' })).toThrow(
      /fully-qualified URL/,
    );
  });
});

describe('IndexingPublishSchema', () => {
  it('requires url', () => {
    expect(() => IndexingPublishSchema.parse({})).toThrow();
  });

  it('defaults type to URL_UPDATED', () => {
    const result = IndexingPublishSchema.parse({ url: 'https://example.com/page' });
    expect(result.type).toBe('URL_UPDATED');
  });

  it('accepts URL_DELETED', () => {
    const result = IndexingPublishSchema.parse({ url: 'https://example.com/page', type: 'URL_DELETED' });
    expect(result.type).toBe('URL_DELETED');
  });

  it('rejects invalid type', () => {
    expect(() =>
      IndexingPublishSchema.parse({ url: 'https://example.com/page', type: 'INVALID' }),
    ).toThrow();
  });

  it('rejects non-URL strings', () => {
    expect(() => IndexingPublishSchema.parse({ url: 'not-a-url' })).toThrow(/fully-qualified URL/);
  });

  it('rejects bare paths', () => {
    expect(() => IndexingPublishSchema.parse({ url: '/page/path' })).toThrow();
  });
});

describe('IndexingStatusSchema', () => {
  it('requires url', () => {
    expect(() => IndexingStatusSchema.parse({})).toThrow();
    const result = IndexingStatusSchema.parse({ url: 'https://example.com/page' });
    expect(result.url).toBe('https://example.com/page');
  });

  it('rejects non-URL strings', () => {
    expect(() => IndexingStatusSchema.parse({ url: 'not-a-url' })).toThrow(/fully-qualified URL/);
  });
});

describe('CrUX schemas', () => {
  it('CrUXQuerySchema requires url or origin', () => {
    expect(() => CrUXQuerySchema.parse({})).toThrow();
  });

  it('CrUXQuerySchema accepts url', () => {
    const result = CrUXQuerySchema.parse({ url: 'https://example.com/page' });
    expect(result.url).toBe('https://example.com/page');
  });

  it('CrUXQuerySchema accepts origin', () => {
    const result = CrUXQuerySchema.parse({ origin: 'https://example.com' });
    expect(result.origin).toBe('https://example.com');
  });

  it('CrUXQuerySchema rejects malformed origin', () => {
    expect(() => CrUXQuerySchema.parse({ origin: 'example.com' })).toThrow(
      /fully-qualified origin URL/,
    );
  });

  it('CrUXQuerySchema rejects payloads with both url and origin', () => {
    expect(() =>
      CrUXQuerySchema.parse({
        url: 'https://example.com/page',
        origin: 'https://example.com',
      }),
    ).toThrow();
  });

  it('CrUXQuerySchema accepts formFactor', () => {
    const result = CrUXQuerySchema.parse({ url: 'https://example.com/', formFactor: 'PHONE' });
    expect(result.formFactor).toBe('PHONE');
  });

  it('CrUXQuerySchema rejects invalid formFactor', () => {
    expect(() =>
      CrUXQuerySchema.parse({ url: 'https://example.com/', formFactor: 'WATCH' }),
    ).toThrow();
  });

  it('CrUXHistorySchema requires url or origin', () => {
    expect(() => CrUXHistorySchema.parse({})).toThrow();
    expect(() => CrUXHistorySchema.parse({ origin: 'https://example.com' })).not.toThrow();
  });

  it('CrUXQuerySchema accepts metrics filter', () => {
    const result = CrUXQuerySchema.parse({
      url: 'https://example.com/',
      metrics: ['largest_contentful_paint', 'cumulative_layout_shift'],
    });
    expect(result.metrics).toHaveLength(2);
  });

  it('accepts stable interaction_to_next_paint metric name', () => {
    const result = CrUXQuerySchema.parse({
      url: 'https://example.com/',
      metrics: ['interaction_to_next_paint'],
    });
    expect(result.metrics).toEqual(['interaction_to_next_paint']);
  });

  it('rejects deprecated experimental_interaction_to_next_paint', () => {
    expect(() =>
      CrUXQuerySchema.parse({
        url: 'https://example.com/',
        metrics: ['experimental_interaction_to_next_paint'],
      }),
    ).toThrow();
  });

  it('rejects deprecated first_input_delay', () => {
    expect(() =>
      CrUXQuerySchema.parse({
        url: 'https://example.com/',
        metrics: ['first_input_delay'],
      }),
    ).toThrow();
  });

  it('accepts newer metrics (round_trip_time, navigation_types, form_factors)', () => {
    const result = CrUXQuerySchema.parse({
      origin: 'https://example.com',
      metrics: ['round_trip_time', 'navigation_types', 'form_factors'],
    });
    expect(result.metrics).toHaveLength(3);
  });

  it('CrUXQuerySchema and CrUXHistorySchema are independent objects', () => {
    // They should parse identically but not be the same reference
    expect(CrUXQuerySchema).not.toBe(CrUXHistorySchema);
  });
});
