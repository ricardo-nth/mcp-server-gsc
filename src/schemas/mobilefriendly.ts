import { z } from 'zod';

/** mobile_friendly_test tool schema */
export const MobileFriendlyTestSchema = z.object({
  url: z
    .string()
    .url('Must be a fully-qualified URL (e.g. https://example.com/page)')
    .describe('The fully-qualified URL to test for mobile-friendliness'),
  requestScreenshot: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to capture a screenshot of the rendered page (default: false)'),
});

export type MobileFriendlyTestInput = z.infer<typeof MobileFriendlyTestSchema>;
