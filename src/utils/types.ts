/** Row returned by the Search Analytics API */
export interface SearchAnalyticsRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

/** Response from searchanalytics.query */
export interface SearchAnalyticsResponse {
  rows?: SearchAnalyticsRow[];
  responseAggregationType?: string;
}

/** URL Inspection result */
export interface InspectionResult {
  inspectionResultLink?: string;
  indexStatusResult?: {
    verdict?: string;
    coverageState?: string;
    robotsTxtState?: string;
    indexingState?: string;
    lastCrawlTime?: string;
    pageFetchState?: string;
    googleCanonical?: string;
    userCanonical?: string;
    crawledAs?: string;
    referringUrls?: string[];
    sitemap?: string[];
  };
  mobileUsabilityResult?: {
    verdict?: string;
    issues?: Array<{ issueType?: string; severity?: string; message?: string }>;
  };
  richResultsResult?: {
    verdict?: string;
    detectedItems?: Array<{ richResultType?: string; items?: unknown[] }>;
  };
}

/** Sitemap entry from the API */
export interface SitemapEntry {
  path?: string;
  lastSubmitted?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  type?: string;
  lastDownloaded?: string;
  warnings?: string;
  errors?: string;
  contents?: Array<{ type?: string; submitted?: string; indexed?: string }>;
}

/** Site entry from sites.list */
export interface SiteEntry {
  siteUrl?: string;
  permissionLevel?: string;
}

/** MCP tool result content block */
export interface TextContent {
  type: 'text';
  text: string;
}

/** Standard tool result shape — index signature satisfies MCP SDK's ServerResult */
export interface ToolResult {
  [key: string]: unknown;
  content: TextContent[];
  structuredContent?: unknown;
  isError?: boolean;
}

function stringifyForText(value: unknown): string {
  return JSON.stringify(
    value,
    (_key: string, item: unknown) => {
      if (typeof item === 'number' && !Number.isFinite(item)) {
        return String(item);
      }
      return item;
    },
    2,
  );
}

/** Helper to create a JSON text result */
export function jsonResult(data: unknown): ToolResult {
  return {
    structuredContent: data,
    content: [{ type: 'text', text: stringifyForText(data) }],
  };
}

/** Helper to create an error result */
export function errorResult(error: string | Record<string, unknown>): ToolResult {
  const payload = typeof error === 'string' ? { error } : error;
  return {
    structuredContent: payload,
    content: [{ type: 'text', text: stringifyForText(payload) }],
    isError: true,
  };
}
