import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  clusterQuery,
  detectChangePoints,
  detectPageTemplate,
  labelQueryIntent,
} from '../src/utils/seo-analysis.js';

interface FixtureData {
  queries: Array<{ query: string; intent: string; cluster: string }>;
  urls: Array<{ url: string; template: string }>;
  changePointSeries: Array<{ date: string; ctr: number; position: number }>;
}

function loadFixture(): FixtureData {
  const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'seo-edge-cases.json');
  const raw = fs.readFileSync(fixturePath, 'utf8');
  return JSON.parse(raw) as FixtureData;
}

describe('Regression fixtures for SEO edge cases', () => {
  it('keeps intent labels and cluster tokens stable for known queries', () => {
    const fixture = loadFixture();
    for (const testCase of fixture.queries) {
      expect(labelQueryIntent(testCase.query)).toBe(testCase.intent);
      expect(clusterQuery(testCase.query)).toBe(testCase.cluster);
    }
  });

  it('keeps template detection stable for known URL patterns', () => {
    const fixture = loadFixture();
    for (const testCase of fixture.urls) {
      expect(detectPageTemplate(testCase.url)).toBe(testCase.template);
    }
  });

  it('detects major CTR/position shifts in known anomaly fixture', () => {
    const fixture = loadFixture();
    const changes = detectChangePoints(fixture.changePointSeries, 1.5);
    const metrics = new Set(changes.map((entry) => entry.metric));

    expect(changes.length).toBeGreaterThan(0);
    expect(metrics.has('ctr')).toBe(true);
    expect(metrics.has('position')).toBe(true);
  });
});
