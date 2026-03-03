interface TemplateRule {
  name: string;
  pattern: string;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'for',
  'to',
  'of',
  'in',
  'on',
  'and',
  'or',
  'with',
  'how',
]);

export function labelQueryIntent(query: string): 'informational' | 'navigational' | 'transactional' | 'commercial' | 'local' {
  const normalized = query.toLowerCase();
  if (/(buy|price|deal|coupon|order|book|subscribe)/.test(normalized)) return 'transactional';
  if (/(best|top|review|compare|vs|alternative)/.test(normalized)) return 'commercial';
  if (/(near me|nearby|in \w+|open now)/.test(normalized)) return 'local';
  if (/(login|dashboard|docs|api|github|official)/.test(normalized)) return 'navigational';
  return 'informational';
}

export function clusterQuery(query: string): string {
  const parts = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

  const topTerms = Array.from(new Set(parts)).sort().slice(0, 3);
  return topTerms.join('-') || 'misc';
}

export function detectPageTemplate(url: string, customRules: TemplateRule[] = []): string {
  let pathname = '';
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = url.toLowerCase();
  }

  for (const rule of customRules) {
    if (pathname.includes(rule.pattern.toLowerCase())) {
      return rule.name;
    }
  }

  if (/(^|\/)blog(\/|$)/.test(pathname)) return 'blog';
  if (/(^|\/)docs?(\/|$)|(^|\/)kb(\/|$)/.test(pathname)) return 'docs';
  if (/(^|\/)product(s)?(\/|$)|(^|\/)pricing(\/|$)/.test(pathname)) return 'product';
  if (/(^|\/)location(s)?(\/|$)|(^|\/)city(\/|$)/.test(pathname)) return 'location';
  if (pathname === '/' || pathname === '') return 'home';
  return 'other';
}

export function detectChangePoints(
  series: Array<{ date: string; ctr: number; position: number }>,
  sensitivity = 2,
): Array<{ metric: 'ctr' | 'position'; date: string; delta: number }> {
  if (series.length < 4) return [];

  const deltasCtr: number[] = [];
  const deltasPos: number[] = [];
  for (let i = 1; i < series.length; i += 1) {
    deltasCtr.push(series[i].ctr - series[i - 1].ctr);
    deltasPos.push(series[i].position - series[i - 1].position);
  }

  const stddev = (values: number[]): number => {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  };

  const ctrStd = stddev(deltasCtr) || 0.01;
  const posStd = stddev(deltasPos) || 0.01;
  const thresholdCtr = ctrStd * sensitivity;
  const thresholdPos = posStd * sensitivity;

  const changePoints: Array<{ metric: 'ctr' | 'position'; date: string; delta: number }> = [];
  for (let i = 1; i < series.length; i += 1) {
    const ctrDelta = deltasCtr[i - 1];
    const posDelta = deltasPos[i - 1];
    if (Math.abs(ctrDelta) >= thresholdCtr) {
      changePoints.push({ metric: 'ctr', date: series[i].date, delta: Number(ctrDelta.toFixed(2)) });
    }
    if (Math.abs(posDelta) >= thresholdPos) {
      changePoints.push({ metric: 'position', date: series[i].date, delta: Number(posDelta.toFixed(2)) });
    }
  }

  return changePoints;
}
