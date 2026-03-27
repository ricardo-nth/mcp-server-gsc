import { describe, it, expect } from 'vitest';
import { AhrefsScaffoldProvider, createDefaultSeoProviders } from '../src/providers/index.js';

describe('AhrefsScaffoldProvider', () => {
  it('loads deterministic fixture-backed metrics for each capability', async () => {
    const provider = new AhrefsScaffoldProvider();

    const backlinks = await provider.getBacklinkMetrics({
      target: 'https://example.com',
    });
    const keywordDifficulty = await provider.getKeywordDifficulty({
      keywords: ['crm software', 'seo audit'],
    });
    const competitorOverlap = await provider.getCompetitorOverlap({
      siteUrl: 'sc-domain:example.com',
      competitors: ['example.org', 'example.net'],
    });
    const trafficEstimate = await provider.getTrafficEstimate({
      target: 'https://example.com',
    });

    expect(provider.metadata.id).toBe('ahrefs');
    expect(provider.metadata.mode).toBe('scaffold');
    expect(backlinks).toEqual({
      target: 'https://example.com',
      referringDomains: 214,
      backlinks: 1984,
    });
    expect(keywordDifficulty).toEqual([
      { keyword: 'crm software', difficulty: 63 },
      { keyword: 'seo audit', difficulty: 39 },
    ]);
    expect(competitorOverlap).toEqual([
      { competitor: 'example.org', overlapKeywords: 240 },
      { competitor: 'example.net', overlapKeywords: 121 },
    ]);
    expect(trafficEstimate).toEqual({
      target: 'https://example.com',
      estimatedMonthlyOrganicVisits: 26750,
    });
  });

  it('registers Ahrefs in the default provider set', () => {
    const providers = createDefaultSeoProviders();
    expect(providers.map((provider) => provider.metadata.id)).toContain('ahrefs');
  });
});
