import { describe, it, expect } from 'vitest';
import { jsonResult, errorResult } from '../src/utils/types.js';

describe('Tool result helpers', () => {
  it('jsonResult serializes non-finite numbers as strings', () => {
    const result = jsonResult({ value: Infinity });
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(parsed.value).toBe('Infinity');
  });

  it('errorResult accepts structured payloads', () => {
    const result = errorResult({ error: 'boom', code: 'TEST_ERROR' });
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(result.isError).toBe(true);
    expect(parsed.code).toBe('TEST_ERROR');
  });
});
