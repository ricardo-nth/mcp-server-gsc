import {
  SEO_PROVIDER_CAPABILITIES,
  type SeoDataProvider,
  type SeoProviderCapability,
  type SeoProviderMetadata,
} from './contracts.js';

export interface SeoProviderRegistrySnapshot {
  totalProviders: number;
  configuredProviders: number;
  capabilities: Record<SeoProviderCapability, string[]>;
  providers: SeoProviderMetadata[];
}

export class SeoProviderRegistry {
  private readonly providers = new Map<string, SeoDataProvider>();

  register(provider: SeoDataProvider): void {
    this.providers.set(provider.metadata.id, provider);
  }

  getProvider(id: string): SeoDataProvider | null {
    return this.providers.get(id) ?? null;
  }

  listProviders(): SeoProviderMetadata[] {
    return Array.from(this.providers.values())
      .map((provider) => provider.metadata)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getProvidersForCapability(capability: SeoProviderCapability): SeoProviderMetadata[] {
    return this.listProviders().filter((provider) => provider.capabilities.includes(capability));
  }

  snapshot(): SeoProviderRegistrySnapshot {
    const providers = this.listProviders();
    const capabilities = SEO_PROVIDER_CAPABILITIES.reduce<Record<SeoProviderCapability, string[]>>(
      (acc, capability) => {
        acc[capability] = providers
          .filter((provider) => provider.capabilities.includes(capability))
          .map((provider) => provider.id);
        return acc;
      },
      {
        backlinks: [],
        keywordDifficulty: [],
        competitorOverlap: [],
        trafficEstimate: [],
      },
    );

    return {
      totalProviders: providers.length,
      configuredProviders: providers.filter((provider) => provider.configured).length,
      capabilities,
      providers,
    };
  }
}

export function createSeoProviderRegistry(providers: SeoDataProvider[] = []): SeoProviderRegistry {
  const registry = new SeoProviderRegistry();
  for (const provider of providers) {
    registry.register(provider);
  }
  return registry;
}
