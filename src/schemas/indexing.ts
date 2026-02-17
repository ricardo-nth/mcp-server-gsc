import { z } from 'zod';

const NOTIFICATION_TYPES = ['URL_UPDATED', 'URL_DELETED'] as const;

/** indexing_publish tool schema */
export const IndexingPublishSchema = z.object({
  url: z
    .string()
    .describe('The fully-qualified URL to notify Google about'),
  type: z
    .enum(NOTIFICATION_TYPES)
    .optional()
    .default('URL_UPDATED')
    .describe('Notification type: URL_UPDATED (request crawl) or URL_DELETED (request removal). Default: URL_UPDATED'),
});

/** indexing_status tool schema */
export const IndexingStatusSchema = z.object({
  url: z
    .string()
    .describe('The URL to get indexing notification metadata for. Must have been previously submitted via the Indexing API.'),
});

export type IndexingPublishInput = z.infer<typeof IndexingPublishSchema>;
export type IndexingStatusInput = z.infer<typeof IndexingStatusSchema>;
