import { describe, it, expect } from 'vitest';
import {
  clampScore,
  confidenceScore,
  impactBucket,
  weightedOpportunityScore,
} from '../src/utils/scoring.js';

function random(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

describe('Scoring property tests', () => {
  it('keeps weighted opportunity scores bounded and deterministic', () => {
    for (let i = 0; i < 400; i += 1) {
      const components = {
        clickUpside: random(-100, 200),
        impressionVolume: random(-100, 200),
        rankDistance: random(-100, 200),
        indexingHealth: random(-100, 200),
        cwvQuality: random(-100, 200),
      };

      const a = weightedOpportunityScore(components);
      const b = weightedOpportunityScore(components);

      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(100);
      expect(a).toBe(b);
    }
  });

  it('keeps confidence scores bounded and monotonic on strong signals', () => {
    for (let i = 0; i < 300; i += 1) {
      const baseline = confidenceScore({
        impressions: random(0, 200),
        diagnosticsCoverage: random(0, 50),
        clickUpside: random(0, 20),
      });
      const stronger = confidenceScore({
        impressions: 1000,
        diagnosticsCoverage: 100,
        clickUpside: 80,
      });

      expect(baseline).toBeGreaterThanOrEqual(0);
      expect(baseline).toBeLessThanOrEqual(100);
      expect(stronger).toBeGreaterThanOrEqual(baseline);
    }
  });

  it('assigns impact buckets in non-decreasing severity order', () => {
    const order = ['low', 'medium', 'high'];
    for (let score = 0; score <= 100; score += 1) {
      const current = impactBucket(score);
      const next = impactBucket(Math.min(100, score + 1));
      expect(order.indexOf(next)).toBeGreaterThanOrEqual(order.indexOf(current));
    }
  });

  it('clamps arbitrary numeric inputs safely', () => {
    for (let i = 0; i < 300; i += 1) {
      const value = random(-10000, 10000);
      const clamped = clampScore(value);
      expect(clamped).toBeGreaterThanOrEqual(0);
      expect(clamped).toBeLessThanOrEqual(100);
    }
  });
});
