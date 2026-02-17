import { SearchConsoleService } from '../service.js';
import { GetSiteSchema, AddSiteSchema, DeleteSiteSchema } from '../schemas/sites.js';
import { jsonResult, type ToolResult } from '../utils/types.js';

export async function handleGetSite(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = GetSiteSchema.parse(raw);
  const response = await service.getSite(args.siteUrl);
  return jsonResult(response.data);
}

export async function handleAddSite(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = AddSiteSchema.parse(raw);
  await service.addSite(args.siteUrl);
  return jsonResult({ success: true, siteUrl: args.siteUrl, message: 'Site added to Search Console' });
}

export async function handleDeleteSite(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = DeleteSiteSchema.parse(raw);
  await service.deleteSite(args.siteUrl);
  return jsonResult({ success: true, siteUrl: args.siteUrl, message: 'Site removed from Search Console' });
}
