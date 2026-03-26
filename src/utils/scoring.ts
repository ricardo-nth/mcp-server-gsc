export const SCORE_WEIGHTS = {
  clickUpside: 0.35,
  impressionVolume: 0.2,
  rankDistance: 0.15,
  indexingHealth: 0.2,
  cwvQuality: 0.1,
} as const;

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function normalizeByMax(value: number, maxValue: number): number {
  if (maxValue <= 0) return 0;
  return clampScore((value / maxValue) * 100);
}

export function rankDistanceScore(position: number): number {
  if (!Number.isFinite(position) || position <= 0) return 0;
  if (position >= 25) return 0;

  if (position >= 4 && position <= 10) {
    return clampScore(100 - Math.abs(position - 7) * 8);
  }

  return clampScore(80 - Math.abs(position - 7) * 6);
}

export function indexingHealthOpportunity(verdict?: string): number {
  if (!verdict) return 40;
  return verdict === 'PASS' ? 10 : 95;
}

export function cwvOpportunityFromPerformanceScore(performanceScore?: number): number {
  if (performanceScore === undefined || performanceScore === null) return 30;
  const normalized = performanceScore <= 1 ? performanceScore * 100 : performanceScore;
  return clampScore(100 - normalized);
}

export function weightedOpportunityScore(components: {
  clickUpside: number;
  impressionVolume: number;
  rankDistance: number;
  indexingHealth: number;
  cwvQuality: number;
}): number {
  const raw =
    components.clickUpside * SCORE_WEIGHTS.clickUpside +
    components.impressionVolume * SCORE_WEIGHTS.impressionVolume +
    components.rankDistance * SCORE_WEIGHTS.rankDistance +
    components.indexingHealth * SCORE_WEIGHTS.indexingHealth +
    components.cwvQuality * SCORE_WEIGHTS.cwvQuality;
  return Number(clampScore(raw).toFixed(2));
}

export function confidenceScore(params: {
  impressions: number;
  diagnosticsCoverage: number;
  clickUpside: number;
}): number {
  const impressionSignal = params.impressions >= 500 ? 100 : (params.impressions / 500) * 100;
  const upsideSignal = params.clickUpside >= 50 ? 100 : (params.clickUpside / 50) * 100;
  const score = impressionSignal * 0.4 + params.diagnosticsCoverage * 0.4 + upsideSignal * 0.2;
  return Number(clampScore(score).toFixed(2));
}

export function impactBucket(score: number): 'low' | 'medium' | 'high' {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}
