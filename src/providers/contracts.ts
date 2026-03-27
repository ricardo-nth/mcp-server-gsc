export const SEO_PROVIDER_CAPABILITIES = [
  'backlinks',
  'keywordDifficulty',
  'competitorOverlap',
  'trafficEstimate',
] as const;

export type SeoProviderCapability = (typeof SEO_PROVIDER_CAPABILITIES)[number];
export type SeoProviderMode = 'live' | 'scaffold';
export type SeoProviderMethodName =
  | 'getBacklinkMetrics'
  | 'getKeywordDifficulty'
  | 'getCompetitorOverlap'
  | 'getTrafficEstimate';

export interface SeoProviderMetadata {
  id: string;
  name: string;
  mode: SeoProviderMode;
  configured: boolean;
  capabilities: SeoProviderCapability[];
}

export interface BacklinkMetricsRequest {
  target: string;
  limit?: number;
}

export interface BacklinkMetricsResponse {
  target: string;
  referringDomains: number | null;
  backlinks: number | null;
}

export interface KeywordDifficultyRequest {
  keywords: string[];
  country?: string;
}

export interface KeywordDifficultyResponse {
  keyword: string;
  difficulty: number | null;
}

export interface CompetitorOverlapRequest {
  siteUrl: string;
  competitors: string[];
}

export interface CompetitorOverlapResponse {
  competitor: string;
  overlapKeywords: number | null;
}

export interface TrafficEstimateRequest {
  target: string;
  country?: string;
}

export interface TrafficEstimateResponse {
  target: string;
  estimatedMonthlyOrganicVisits: number | null;
}

export interface SeoDataProvider {
  readonly metadata: SeoProviderMetadata;
  getBacklinkMetrics?(input: BacklinkMetricsRequest): Promise<BacklinkMetricsResponse>;
  getKeywordDifficulty?(input: KeywordDifficultyRequest): Promise<KeywordDifficultyResponse[]>;
  getCompetitorOverlap?(input: CompetitorOverlapRequest): Promise<CompetitorOverlapResponse[]>;
  getTrafficEstimate?(input: TrafficEstimateRequest): Promise<TrafficEstimateResponse>;
}

export const SEO_PROVIDER_METHODS: Record<SeoProviderCapability, SeoProviderMethodName> = {
  backlinks: 'getBacklinkMetrics',
  keywordDifficulty: 'getKeywordDifficulty',
  competitorOverlap: 'getCompetitorOverlap',
  trafficEstimate: 'getTrafficEstimate',
};

export function validateSeoProvider(provider: SeoDataProvider): void {
  for (const capability of provider.metadata.capabilities) {
    const methodName = SEO_PROVIDER_METHODS[capability];
    if (typeof provider[methodName] !== 'function') {
      throw new Error(
        `Provider "${provider.metadata.id}" advertises capability "${capability}" but is missing ${methodName}().`,
      );
    }
  }
}
