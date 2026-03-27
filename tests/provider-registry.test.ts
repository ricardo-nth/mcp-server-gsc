import { describe, it, expect } from 'vitest';
import type { SeoDataProvider } from '../src/providers/contracts.js';
import { createSeoProviderRegistry } from '../src/providers/index.js';

describe('SeoProviderRegistry', () => {
  it('groups providers by capability and tracks configured count', () => {
    const registry = createSeoProviderRegistry([
      {
        metadata: {
          id: 'fixture-provider',
          name: 'Fixture Provider',
          mode: 'scaffold',
          configured: false,
          capabilities: ['backlinks', 'trafficEstimate'],
        },
      } satisfies SeoDataProvider,
      {
        metadata: {
          id: 'configured-provider',
          name: 'Configured Provider',
          mode: 'live',
          configured: true,
          capabilities: ['keywordDifficulty'],
        },
      } satisfies SeoDataProvider,
    ]);

    const snapshot = registry.snapshot();

    expect(snapshot.totalProviders).toBe(2);
    expect(snapshot.configuredProviders).toBe(1);
    expect(snapshot.capabilities.backlinks).toEqual(['fixture-provider']);
    expect(snapshot.capabilities.trafficEstimate).toEqual(['fixture-provider']);
    expect(snapshot.capabilities.keywordDifficulty).toEqual(['configured-provider']);
    expect(snapshot.capabilities.competitorOverlap).toEqual([]);
  });
});
