import { describe, it, expect } from 'vitest';
import { jsonResult, errorResult, toEnvelopedResult } from '../src/utils/types.js';

describe('Tool result helpers', () => {
  it('jsonResult serializes non-finite numbers as strings', () => {
    const result = jsonResult({ value: Infinity });
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(parsed.value).toBe('Infinity');
    expect((result.structuredContent as Record<string, unknown>).value).toBe(Infinity);
  });

  it('errorResult accepts structured payloads', () => {
    const result = errorResult({ error: 'boom', code: 'TEST_ERROR' });
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(result.isError).toBe(true);
    expect(parsed.code).toBe('TEST_ERROR');
    expect((result.structuredContent as Record<string, unknown>).code).toBe('TEST_ERROR');
  });

  it('toEnvelopedResult adds schemaVersion, requestId, mode, and summary fields', () => {
    const result = toEnvelopedResult(jsonResult({ clicks: 42 }), {
      schemaVersion: '1.0.0',
      requestId: 'req-123',
      mode: 'full',
      toolName: 'search_analytics',
      summary: {
        whatChanged: 'search_analytics completed successfully.',
        whyItMatters: 'Result is ready for follow-up analysis.',
        suggestedNextTool: 'detect_quick_wins',
      },
    });

    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    const summary = parsed.summary as Record<string, unknown>;

    expect(parsed.schemaVersion).toBe('1.0.0');
    expect(parsed.requestId).toBe('req-123');
    expect(parsed.mode).toBe('full');
    expect(summary.whatChanged).toContain('completed successfully');
    expect(summary.suggestedNextTool).toBe('detect_quick_wins');
    expect(parsed.clicks).toBe(42);
  });

  it('toEnvelopedResult compacts large arrays in compact mode', () => {
    const rows = Array.from({ length: 80 }, (_, index) => ({ keys: [`q-${index}`], clicks: index }));
    const result = toEnvelopedResult(jsonResult({ rows }), {
      schemaVersion: '1.0.0',
      requestId: 'req-compact',
      mode: 'compact',
      toolName: 'search_analytics',
      summary: {
        whatChanged: 'search_analytics completed successfully.',
        whyItMatters: 'Compact mode keeps token usage low.',
      },
    });

    const payload = result.structuredContent as Record<string, unknown>;
    const compact = payload.compact as Record<string, unknown>;
    const compactRows = payload.rows as Array<Record<string, unknown>>;

    expect(payload.mode).toBe('compact');
    expect(compact.truncated).toBe(true);
    expect(compactRows.length).toBe(25);
  });
});
