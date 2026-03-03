import { describe, it, expect } from 'vitest';
import { errorResult, jsonResult, toEnvelopedResult } from '../src/utils/types.js';

describe('Golden response envelope contracts', () => {
  it('matches the canonical success envelope shape', () => {
    const result = toEnvelopedResult(
      jsonResult({ rows: [{ keys: ['query'], clicks: 10 }] }),
      {
        schemaVersion: '1.0.0',
        requestId: 'req-golden-success',
        mode: 'full',
        toolName: 'search_analytics',
        summary: {
          whatChanged: 'search_analytics completed successfully.',
          whyItMatters: 'The result can be chained into follow-up SEO diagnostics or optimization actions.',
          suggestedNextTool: 'detect_quick_wins',
        },
        metadata: {
          cacheHit: false,
          cacheAgeSec: null,
          cacheKey: 'search_analytics:{"days":7}',
          retries: 0,
          quotaUnitsEstimated: 0,
        },
      },
    );

    expect(result.structuredContent).toMatchInlineSnapshot(`
      {
        "cacheAgeSec": null,
        "cacheHit": false,
        "cacheKey": "search_analytics:{\"days\":7}",
        "mode": "full",
        "quotaUnitsEstimated": 0,
        "requestId": "req-golden-success",
        "retries": 0,
        "rows": [
          {
            "clicks": 10,
            "keys": [
              "query",
            ],
          },
        ],
        "schemaVersion": "1.0.0",
        "summary": {
          "suggestedNextTool": "detect_quick_wins",
          "whatChanged": "search_analytics completed successfully.",
          "whyItMatters": "The result can be chained into follow-up SEO diagnostics or optimization actions.",
        },
      }
    `);
  });

  it('matches the canonical error envelope shape', () => {
    const result = toEnvelopedResult(
      errorResult({ error: 'Invalid arguments', code: 'VALIDATION_ERROR', statusCode: 400 }),
      {
        schemaVersion: '1.0.0',
        requestId: 'req-golden-error',
        mode: 'full',
        toolName: 'search_analytics',
        summary: {
          whatChanged: 'search_analytics failed and returned a structured error payload.',
          whyItMatters:
            'Agents can branch deterministically on error codes/messages instead of parsing unstructured text.',
          suggestedNextTool: 'gsc_healthcheck',
        },
        metadata: {
          cacheHit: false,
          cacheAgeSec: null,
          cacheKey: null,
          retries: 1,
          quotaUnitsEstimated: 10,
        },
      },
    );

    expect(result.structuredContent).toMatchInlineSnapshot(`
      {
        "cacheAgeSec": null,
        "cacheHit": false,
        "cacheKey": null,
        "code": "VALIDATION_ERROR",
        "error": "Invalid arguments",
        "mode": "full",
        "quotaUnitsEstimated": 10,
        "requestId": "req-golden-error",
        "retries": 1,
        "schemaVersion": "1.0.0",
        "statusCode": 400,
        "summary": {
          "suggestedNextTool": "gsc_healthcheck",
          "whatChanged": "search_analytics failed and returned a structured error payload.",
          "whyItMatters": "Agents can branch deterministically on error codes/messages instead of parsing unstructured text.",
        },
      }
    `);
  });
});
