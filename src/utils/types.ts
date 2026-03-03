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

export type ResponseMode = 'compact' | 'full';

export interface ResponseSummary {
  whatChanged: string;
  whyItMatters: string;
  suggestedNextTool?: string;
}

export interface EnvelopeOptions {
  schemaVersion: string;
  requestId: string;
  mode: ResponseMode;
  toolName: string;
  summary: ResponseSummary;
  metadata?: Record<string, unknown>;
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

function normalizeStructuredPayload(result: ToolResult): unknown {
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }

  const text = result.content[0]?.text;
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { value: text };
  }
}

interface CompactState {
  truncatedPaths: string[];
}

function compactValue(value: unknown, path: string, state: CompactState, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (depth >= 6) {
    return '[Truncated: max depth reached]';
  }

  if (Array.isArray(value)) {
    const limit = 25;
    const compacted = value.slice(0, limit).map((item, index) =>
      compactValue(item, `${path}[${index}]`, state, depth + 1),
    );
    if (value.length > limit) {
      state.truncatedPaths.push(path || '$');
    }
    return compacted;
  }

  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const nestedPath = path ? `${path}.${key}` : key;
    output[key] = compactValue(nestedValue, nestedPath, state, depth + 1);
  }
  return output;
}

function applyModeToPayload(
  payload: unknown,
  mode: ResponseMode,
): { data: unknown; truncatedPaths: string[] } {
  if (mode === 'full') {
    return { data: payload, truncatedPaths: [] };
  }

  const state: CompactState = { truncatedPaths: [] };
  const data = compactValue(payload, '', state);
  return { data, truncatedPaths: state.truncatedPaths };
}

function envelopePayload(payload: unknown, options: EnvelopeOptions): Record<string, unknown> {
  const { data, truncatedPaths } = applyModeToPayload(payload, options.mode);

  const baseEnvelope: Record<string, unknown> = {
    schemaVersion: options.schemaVersion,
    requestId: options.requestId,
    mode: options.mode,
    ...(options.metadata ?? {}),
    summary: {
      ...options.summary,
      whatChanged:
        options.mode === 'compact' && truncatedPaths.length > 0
          ? `${options.summary.whatChanged} Compact mode truncated ${truncatedPaths.length} large list(s).`
          : options.summary.whatChanged,
    },
  };

  if (options.mode === 'compact' && truncatedPaths.length > 0) {
    baseEnvelope.compact = {
      truncated: true,
      truncatedPaths,
    };
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return {
      ...baseEnvelope,
      ...(data as Record<string, unknown>),
    };
  }

  return {
    ...baseEnvelope,
    data,
  };
}

export function toEnvelopedResult(result: ToolResult, options: EnvelopeOptions): ToolResult {
  const payload = normalizeStructuredPayload(result);
  const enveloped = envelopePayload(payload, options);

  return {
    ...result,
    structuredContent: enveloped,
    content: [{ type: 'text', text: stringifyForText(enveloped) }],
  };
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
