import { SearchConsoleService } from '../service.js';
import { PageSpeedInsightsSchema } from '../schemas/pagespeed.js';
import { jsonResult, type ToolResult } from '../utils/types.js';

export async function handlePageSpeedInsights(
  service: SearchConsoleService,
  raw: unknown,
): Promise<ToolResult> {
  const args = PageSpeedInsightsSchema.parse(raw);
  const response = await service.runPageSpeed({
    url: args.url,
    categories: [...args.categories],
    strategy: args.strategy,
    locale: args.locale,
  });

  const data = response.data;
  const lighthouse = data.lighthouseResult;
  const loadingExperience = data.loadingExperience;

  const result: Record<string, unknown> = {
    url: data.id,
    analysisUTCTimestamp: data.analysisUTCTimestamp,
  };

  if (lighthouse?.categories) {
    result.scores = Object.fromEntries(
      Object.entries(lighthouse.categories).map(([key, cat]) => [
        key,
        {
          score: ((cat as Record<string, unknown>).score as number ?? 0) * 100,
          title: (cat as Record<string, unknown>).title,
        },
      ]),
    );
  }

  if (loadingExperience?.metrics) {
    result.fieldData = loadingExperience.metrics;
    result.overallCategory = loadingExperience.overall_category;
  }

  result.lighthouseVersion = lighthouse?.lighthouseVersion;
  result.fetchTime = lighthouse?.fetchTime;

  return jsonResult(result);
}
