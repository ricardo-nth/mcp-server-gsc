declare module 'zod-to-json-schema' {
  import type { ZodTypeAny } from 'zod';

  export function zodToJsonSchema(
    schema: ZodTypeAny,
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
}
