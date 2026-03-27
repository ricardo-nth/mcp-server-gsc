import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SEO_PROVIDER_CAPABILITIES,
  type BacklinkMetricsRequest,
  type BacklinkMetricsResponse,
  type CompetitorOverlapRequest,
  type CompetitorOverlapResponse,
  type KeywordDifficultyRequest,
  type KeywordDifficultyResponse,
  type SeoDataProvider,
  type TrafficEstimateRequest,
  type TrafficEstimateResponse,
} from './contracts.js';

interface AhrefsFixtureData {
  backlinks: Omit<BacklinkMetricsResponse, 'target'>;
  keywordDifficulty: Array<Omit<KeywordDifficultyResponse, 'keyword'>>;
  competitorOverlap: Array<Omit<CompetitorOverlapResponse, 'competitor'>>;
  trafficEstimate: Omit<TrafficEstimateResponse, 'target'>;
}

const DEFAULT_AHREFS_FIXTURES: AhrefsFixtureData = {
  backlinks: {
    referringDomains: 142,
    backlinks: 1287,
  },
  keywordDifficulty: [
    { difficulty: 54 },
    { difficulty: 32 },
    { difficulty: 18 },
  ],
  competitorOverlap: [
    { overlapKeywords: 186 },
    { overlapKeywords: 91 },
    { overlapKeywords: 44 },
  ],
  trafficEstimate: {
    estimatedMonthlyOrganicVisits: 18400,
  },
};

export interface AhrefsScaffoldProviderOptions {
  fixturePath?: string;
  apiToken?: string;
}

export class AhrefsScaffoldProvider implements SeoDataProvider {
  readonly metadata;
  private readonly fixturePath: string;

  constructor(options: AhrefsScaffoldProviderOptions = {}) {
    this.fixturePath =
      options.fixturePath ?? resolve(process.cwd(), 'tests', 'fixtures', 'ahrefs-scaffold.json');

    this.metadata = {
      id: 'ahrefs',
      name: 'Ahrefs',
      mode: 'scaffold' as const,
      configured: Boolean(options.apiToken ?? process.env.AHREFS_API_TOKEN),
      capabilities: [...SEO_PROVIDER_CAPABILITIES],
    };
  }

  private loadFixtures(): AhrefsFixtureData {
    try {
      return JSON.parse(readFileSync(this.fixturePath, 'utf8')) as AhrefsFixtureData;
    } catch {
      return DEFAULT_AHREFS_FIXTURES;
    }
  }

  async getBacklinkMetrics(input: BacklinkMetricsRequest): Promise<BacklinkMetricsResponse> {
    const fixture = this.loadFixtures();
    return {
      target: input.target,
      ...fixture.backlinks,
    };
  }

  async getKeywordDifficulty(input: KeywordDifficultyRequest): Promise<KeywordDifficultyResponse[]> {
    const fixture = this.loadFixtures();
    return input.keywords.map((keyword, index) => ({
      keyword,
      difficulty: fixture.keywordDifficulty[index]?.difficulty ?? fixture.keywordDifficulty.at(-1)?.difficulty ?? null,
    }));
  }

  async getCompetitorOverlap(
    input: CompetitorOverlapRequest,
  ): Promise<CompetitorOverlapResponse[]> {
    const fixture = this.loadFixtures();
    return input.competitors.map((competitor, index) => ({
      competitor,
      overlapKeywords:
        fixture.competitorOverlap[index]?.overlapKeywords ??
        fixture.competitorOverlap.at(-1)?.overlapKeywords ??
        null,
    }));
  }

  async getTrafficEstimate(input: TrafficEstimateRequest): Promise<TrafficEstimateResponse> {
    const fixture = this.loadFixtures();
    return {
      target: input.target,
      ...fixture.trafficEstimate,
    };
  }
}

export function createDefaultSeoProviders(): SeoDataProvider[] {
  return [new AhrefsScaffoldProvider()];
}
