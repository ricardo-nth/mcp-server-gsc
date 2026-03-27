import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('normalizes malformed fixture payloads instead of crashing', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'ahrefs-fixture-'));
    const fixturePath = join(tempDir, 'fixture.json');

    try {
      await writeFile(
        fixturePath,
        JSON.stringify({
          backlinks: { referringDomains: 'oops' },
          keywordDifficulty: [{ difficulty: 12 }, { difficulty: 'bad' }],
          competitorOverlap: [{ overlapKeywords: 'bad' }],
          trafficEstimate: { estimatedMonthlyOrganicVisits: 'bad' },
        }),
        'utf8',
      );

      const provider = new AhrefsScaffoldProvider({ fixturePath });

      await expect(
        provider.getBacklinkMetrics({
          target: 'https://example.com',
        }),
      ).resolves.toEqual({
        target: 'https://example.com',
        referringDomains: 142,
        backlinks: 1287,
      });
      await expect(
        provider.getKeywordDifficulty({
          keywords: ['crm software', 'seo audit'],
        }),
      ).resolves.toEqual([
        { keyword: 'crm software', difficulty: 12 },
        { keyword: 'seo audit', difficulty: 18 },
      ]);
      await expect(
        provider.getCompetitorOverlap({
          siteUrl: 'sc-domain:example.com',
          competitors: ['example.org'],
        }),
      ).resolves.toEqual([{ competitor: 'example.org', overlapKeywords: 44 }]);
      await expect(
        provider.getTrafficEstimate({
          target: 'https://example.com',
        }),
      ).resolves.toEqual({
        target: 'https://example.com',
        estimatedMonthlyOrganicVisits: 18400,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
