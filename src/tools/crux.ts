import { SearchConsoleService } from '../service.js';
import { CrUXQuerySchema, CrUXHistorySchema } from '../schemas/crux.js';
import { jsonResult, type ToolResult } from '../utils/types.js';

export async function handleCrUXQuery(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = CrUXQuerySchema.parse(raw);
  const response = await service.cruxQueryRecord({
    url: args.url,
    origin: args.origin,
    formFactor: args.formFactor,
    metrics: args.metrics ? [...args.metrics] : undefined,
  });
  return jsonResult(response.data);
}

export async function handleCrUXHistory(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = CrUXHistorySchema.parse(raw);
  const response = await service.cruxQueryHistory({
    url: args.url,
    origin: args.origin,
    formFactor: args.formFactor,
    metrics: args.metrics ? [...args.metrics] : undefined,
  });
  return jsonResult(response.data);
}
