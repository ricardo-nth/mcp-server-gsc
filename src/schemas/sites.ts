import { z } from 'zod';

/** get_site tool schema */
export const GetSiteSchema = z.object({
  siteUrl: z
    .string()
    .describe('The site URL as registered in Search Console (e.g. https://www.example.com/ or sc-domain:example.com)'),
});

/** add_site tool schema */
export const AddSiteSchema = z.object({
  siteUrl: z
    .string()
    .describe('The site URL to add to Search Console (e.g. https://www.example.com/ or sc-domain:example.com)'),
});

/** delete_site tool schema */
export const DeleteSiteSchema = z.object({
  siteUrl: z
    .string()
    .describe('The site URL to remove from Search Console'),
});

export type GetSiteInput = z.infer<typeof GetSiteSchema>;
export type AddSiteInput = z.infer<typeof AddSiteSchema>;
export type DeleteSiteInput = z.infer<typeof DeleteSiteSchema>;
