const SENSITIVE_KEY_PATTERN = /(key|token|secret|password|credential|authorization|cookie|private|session)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi;

function redactString(value: string): string {
  let next = value;

  next = next.replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');
  next = next.replace(BEARER_PATTERN, 'Bearer [REDACTED_TOKEN]');

  if (/AIza[0-9A-Za-z_-]{20,}/.test(next)) {
    next = next.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]');
  }

  if (next.length > 80 && !next.includes(' ')) {
    return '[REDACTED_LONG_TOKEN]';
  }

  return next;
}

export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth >= 8) {
    return '[TRUNCATED]';
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = '[REDACTED]';
      continue;
    }
    output[key] = redactSensitiveData(nested, depth + 1);
  }

  return output;
}
