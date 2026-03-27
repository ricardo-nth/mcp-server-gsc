import { describe, it, expect } from 'vitest';
import type { SeoDataProvider } from '../src/providers/contracts.js';
import { createSeoProviderRegistry } from '../src/providers/index.js';

describe('SeoProviderRegistry', () => {
  const backlinkProvider = {
    metadata: {
      id: 'fixture-provider',
      name: 'Fixture Provider',
      mode: 'scaffold',
      configured: false,
      capabilities: ['backlinks', 'trafficEstimate'],
    },
    getBacklinkMetrics: async ({ target }) => ({
      target,
      referringDomains: 10,
      backlinks: 100,
    }),
    getTrafficEstimate: async ({ target }) => ({
      target,
      estimatedMonthlyOrganicVisits: 1000,
    }),
  } satisfies SeoDataProvider;

  const keywordProvider = {
    metadata: {
      id: 'configured-provider',
      name: 'Configured Provider',
      mode: 'live',
      configured: true,
      capabilities: ['keywordDifficulty'],
    },
    getKeywordDifficulty: async ({ keywords }) =>
      keywords.map((keyword) => ({ keyword, difficulty: 42 })),
  } satisfies SeoDataProvider;

  it('groups providers by capability and tracks configured count', () => {
    const registry = createSeoProviderRegistry([backlinkProvider, keywordProvider]);

    const snapshot = registry.snapshot();

    expect(snapshot.totalProviders).toBe(2);
    expect(snapshot.configuredProviders).toBe(1);
    expect(snapshot.capabilities.backlinks).toEqual(['fixture-provider']);
    expect(snapshot.capabilities.trafficEstimate).toEqual(['fixture-provider']);
    expect(snapshot.capabilities.keywordDifficulty).toEqual(['configured-provider']);
    expect(snapshot.capabilities.competitorOverlap).toEqual([]);
  });

  it('rejects duplicate provider ids', () => {
    expect(() =>
      createSeoProviderRegistry([
        backlinkProvider,
        {
          ...backlinkProvider,
          metadata: {
            ...backlinkProvider.metadata,
          },
        },
      ]),
    ).toThrow(/already registered/);
  });

  it('rejects providers that advertise unsupported capabilities', () => {
    expect(() =>
      createSeoProviderRegistry([
        {
          metadata: {
            id: 'broken-provider',
            name: 'Broken Provider',
            mode: 'scaffold',
            configured: false,
            capabilities: ['competitorOverlap'],
          },
        } satisfies SeoDataProvider,
      ]),
    ).toThrow(/missing getCompetitorOverlap\(\)/);
  });
});
