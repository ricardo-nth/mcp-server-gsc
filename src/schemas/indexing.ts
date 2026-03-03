import { z } from 'zod';

const NOTIFICATION_TYPES = ['URL_UPDATED', 'URL_DELETED'] as const;

/** indexing_publish tool schema */
export const IndexingPublishSchema = z.object({
  url: z
    .string()
    .url('Must be a fully-qualified URL (e.g. https://example.com/page)')
    .describe('The fully-qualified URL to notify Google about'),
  type: z
    .enum(NOTIFICATION_TYPES)
    .optional()
    .default('URL_UPDATED')
    .describe('Notification type: URL_UPDATED (request crawl) or URL_DELETED (request removal). Default: URL_UPDATED'),
  idempotencyKey: z
    .string()
    .min(8)
    .max(128)
    .optional()
    .describe(
      'Optional idempotency key for safe retries. Reusing the same key with identical intent returns the original publish result without issuing another mutation.',
    ),
});

/** indexing_status tool schema */
export const IndexingStatusSchema = z.object({
  url: z
    .string()
    .url('Must be a fully-qualified URL (e.g. https://example.com/page)')
    .describe('The URL to get indexing notification metadata for. Must have been previously submitted via the Indexing API.'),
});

export type IndexingPublishInput = z.infer<typeof IndexingPublishSchema>;
export type IndexingStatusInput = z.infer<typeof IndexingStatusSchema>;
