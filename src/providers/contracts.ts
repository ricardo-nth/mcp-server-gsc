export const SEO_PROVIDER_CAPABILITIES = [
  'backlinks',
  'keywordDifficulty',
  'competitorOverlap',
  'trafficEstimate',
] as const;

export type SeoProviderCapability = (typeof SEO_PROVIDER_CAPABILITIES)[number];
export type SeoProviderMode = 'live' | 'scaffold';

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
