import { SearchConsoleService } from '../service.js';
import { IndexingPublishSchema, IndexingStatusSchema } from '../schemas/indexing.js';
import { jsonResult, type ToolResult } from '../utils/types.js';

export async function handleIndexingPublish(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = IndexingPublishSchema.parse(raw);
  const response = await service.indexingPublish(args.url, args.type);
  return jsonResult(response.data);
}

export async function handleIndexingStatus(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = IndexingStatusSchema.parse(raw);
  const response = await service.indexingGetMetadata(args.url);
  return jsonResult(response.data);
}
