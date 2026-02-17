import { SearchConsoleService } from '../service.js';
import { MobileFriendlyTestSchema } from '../schemas/mobilefriendly.js';
import { jsonResult, type ToolResult } from '../utils/types.js';

export async function handleMobileFriendlyTest(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = MobileFriendlyTestSchema.parse(raw);
  const response = await service.mobileFriendlyTest(args.url, args.requestScreenshot);
  return jsonResult(response.data);
}
