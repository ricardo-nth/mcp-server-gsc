import { z } from 'zod';

const PSI_CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'] as const;
const PSI_STRATEGIES = ['mobile', 'desktop'] as const;

/** pagespeed_insights tool schema */
export const PageSpeedInsightsSchema = z.object({
  url: z
    .string()
    .describe('The URL to run PageSpeed Insights on'),
  categories: z
    .array(z.enum(PSI_CATEGORIES))
    .optional()
    .default(['performance'])
    .describe('Lighthouse categories to audit (default: ["performance"]). Options: performance, accessibility, best-practices, seo, pwa'),
  strategy: z
    .enum(PSI_STRATEGIES)
    .optional()
    .default('mobile')
    .describe('Analysis strategy: mobile (default) or desktop'),
  locale: z
    .string()
    .optional()
    .describe('Locale for localized results (e.g. "en_US", "de_DE")'),
});

export type PageSpeedInsightsInput = z.infer<typeof PageSpeedInsightsSchema>;
