import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const DEFAULT_AHREFS_FIXTURE_PATH = fileURLToPath(
  new URL('../../tests/fixtures/ahrefs-scaffold.json', import.meta.url),
);

export interface AhrefsScaffoldProviderOptions {
  fixturePath?: string;
  apiToken?: string;
}

export class AhrefsScaffoldProvider implements SeoDataProvider {
  readonly metadata;
  private readonly fixturePath: string;

  constructor(options: AhrefsScaffoldProviderOptions = {}) {
    this.fixturePath = options.fixturePath ?? DEFAULT_AHREFS_FIXTURE_PATH;

    this.metadata = {
      id: 'ahrefs',
      name: 'Ahrefs',
      mode: 'scaffold' as const,
      configured: Boolean(options.apiToken ?? process.env.AHREFS_API_TOKEN),
      capabilities: [...SEO_PROVIDER_CAPABILITIES],
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private normalizeBacklinks(value: unknown): AhrefsFixtureData['backlinks'] {
    if (!this.isRecord(value)) return DEFAULT_AHREFS_FIXTURES.backlinks;
    return {
      referringDomains:
        typeof value.referringDomains === 'number'
          ? value.referringDomains
          : DEFAULT_AHREFS_FIXTURES.backlinks.referringDomains,
      backlinks:
        typeof value.backlinks === 'number'
          ? value.backlinks
          : DEFAULT_AHREFS_FIXTURES.backlinks.backlinks,
    };
  }

  private normalizeKeywordDifficulty(value: unknown): AhrefsFixtureData['keywordDifficulty'] {
    if (!Array.isArray(value) || value.length === 0) return DEFAULT_AHREFS_FIXTURES.keywordDifficulty;
    const normalized = value
      .map((entry) => {
        if (!this.isRecord(entry)) return null;
        return {
          difficulty:
            typeof entry.difficulty === 'number'
              ? entry.difficulty
              : DEFAULT_AHREFS_FIXTURES.keywordDifficulty.at(-1)?.difficulty ?? null,
        };
      })
      .filter((entry): entry is AhrefsFixtureData['keywordDifficulty'][number] => entry !== null);
    return normalized.length > 0 ? normalized : DEFAULT_AHREFS_FIXTURES.keywordDifficulty;
  }

  private normalizeCompetitorOverlap(value: unknown): AhrefsFixtureData['competitorOverlap'] {
    if (!Array.isArray(value) || value.length === 0) return DEFAULT_AHREFS_FIXTURES.competitorOverlap;
    const normalized = value
      .map((entry) => {
        if (!this.isRecord(entry)) return null;
        return {
          overlapKeywords:
            typeof entry.overlapKeywords === 'number'
              ? entry.overlapKeywords
              : DEFAULT_AHREFS_FIXTURES.competitorOverlap.at(-1)?.overlapKeywords ?? null,
        };
      })
      .filter((entry): entry is AhrefsFixtureData['competitorOverlap'][number] => entry !== null);
    return normalized.length > 0 ? normalized : DEFAULT_AHREFS_FIXTURES.competitorOverlap;
  }

  private normalizeTrafficEstimate(value: unknown): AhrefsFixtureData['trafficEstimate'] {
    if (!this.isRecord(value)) return DEFAULT_AHREFS_FIXTURES.trafficEstimate;
    return {
      estimatedMonthlyOrganicVisits:
        typeof value.estimatedMonthlyOrganicVisits === 'number'
          ? value.estimatedMonthlyOrganicVisits
          : DEFAULT_AHREFS_FIXTURES.trafficEstimate.estimatedMonthlyOrganicVisits,
    };
  }

  private loadFixtures(): AhrefsFixtureData {
    try {
      const parsed = JSON.parse(readFileSync(resolve(this.fixturePath), 'utf8')) as unknown;
      const fixture = this.isRecord(parsed) ? parsed : {};
      return {
        backlinks: this.normalizeBacklinks(fixture.backlinks),
        keywordDifficulty: this.normalizeKeywordDifficulty(fixture.keywordDifficulty),
        competitorOverlap: this.normalizeCompetitorOverlap(fixture.competitorOverlap),
        trafficEstimate: this.normalizeTrafficEstimate(fixture.trafficEstimate),
      };
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
