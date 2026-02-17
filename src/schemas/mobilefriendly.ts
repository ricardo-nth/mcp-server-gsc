import { z } from 'zod';

/** mobile_friendly_test tool schema */
export const MobileFriendlyTestSchema = z.object({
  url: z
    .string()
    .describe('The fully-qualified URL to test for mobile-friendliness'),
  requestScreenshot: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to capture a screenshot of the rendered page (default: false)'),
});

export type MobileFriendlyTestInput = z.infer<typeof MobileFriendlyTestSchema>;
