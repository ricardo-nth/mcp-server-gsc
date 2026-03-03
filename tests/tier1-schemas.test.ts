import { describe, it, expect } from 'vitest';
import { GetSiteSchema, AddSiteSchema, DeleteSiteSchema } from '../src/schemas/sites.js';
import { MobileFriendlyTestSchema } from '../src/schemas/mobilefriendly.js';
import { PageSpeedInsightsSchema } from '../src/schemas/pagespeed.js';
import { IndexingPublishSchema, IndexingStatusSchema } from '../src/schemas/indexing.js';
import { CrUXQuerySchema, CrUXHistorySchema } from '../src/schemas/crux.js';
import { RecommendNextActionsSchema } from '../src/schemas/recommendations.js';
import { QuickWinsSchema } from '../src/schemas/analytics.js';
import { CannibalizationSchema } from '../src/schemas/computed.js';
import { DropAlertsSchema, IndexingHealthReportSchema } from '../src/schemas/computed2.js';
import { RunSeoAuditWorkflowSchema } from '../src/schemas/workflow.js';

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

  it('accepts idempotencyKey for safe retries', () => {
    const result = IndexingPublishSchema.parse({
      url: 'https://example.com/page',
      idempotencyKey: 'publish-2026-03-03-001',
    });
    expect(result.idempotencyKey).toBe('publish-2026-03-03-001');
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

describe('RecommendNextActionsSchema', () => {
  it('provides sane defaults for recommendation modeling', () => {
    const result = RecommendNextActionsSchema.parse({
      siteUrl: 'sc-domain:example.com',
      days: 28,
    });

    expect(result.rowLimit).toBe(1000);
    expect(result.topActions).toBe(5);
    expect(result.minImpressions).toBe(80);
    expect(result.includeCwv).toBe(true);
  });
});

describe('Phase 4 schema extensions', () => {
  it('QuickWinsSchema supports intentAware option', () => {
    const result = QuickWinsSchema.parse({
      siteUrl: 'sc-domain:example.com',
      days: 7,
      intentAware: true,
    });
    expect(result.intentAware).toBe(true);
  });

  it('CannibalizationSchema supports intentAware option', () => {
    const result = CannibalizationSchema.parse({
      siteUrl: 'sc-domain:example.com',
      days: 14,
      intentAware: true,
    });
    expect(result.intentAware).toBe(true);
  });

  it('IndexingHealthReportSchema accepts sitemap and combined sources', () => {
    const sitemap = IndexingHealthReportSchema.parse({
      siteUrl: 'sc-domain:example.com',
      source: 'sitemap',
      sitemapUrls: ['https://example.com/sitemap.xml'],
      days: 7,
    });
    const combined = IndexingHealthReportSchema.parse({
      siteUrl: 'sc-domain:example.com',
      source: 'combined',
      sitemapUrls: ['https://example.com/sitemap.xml'],
      urls: ['https://example.com/a'],
      days: 7,
    });
    expect(sitemap.source).toBe('sitemap');
    expect(combined.source).toBe('combined');
  });

  it('DropAlertsSchema supports seasonal and change-point controls', () => {
    const result = DropAlertsSchema.parse({
      siteUrl: 'sc-domain:example.com',
      days: 7,
      seasonalAdjustment: true,
      includeChangePoints: true,
      changePointSensitivity: 3,
    });
    expect(result.seasonalAdjustment).toBe(true);
    expect(result.includeChangePoints).toBe(true);
    expect(result.changePointSensitivity).toBe(3);
  });
});

describe('RunSeoAuditWorkflowSchema', () => {
  it('supports profile defaults and markdown flag', () => {
    const result = RunSeoAuditWorkflowSchema.parse({
      siteUrl: 'sc-domain:example.com',
      days: 28,
      markdown: true,
    });

    expect(result.profile).toBe('technical');
    expect(result.topN).toBe(25);
    expect(result.rowLimit).toBe(1000);
    expect(result.markdown).toBe(true);
  });
});
