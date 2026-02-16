import { google, searchconsole_v1, webmasters_v3 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { withRetry } from './utils/retry.js';

type SearchAnalyticsRequest =
  webmasters_v3.Params$Resource$Searchanalytics$Query['requestBody'];
type ListSitemapsParams = webmasters_v3.Params$Resource$Sitemaps$List;
type GetSitemapParams = webmasters_v3.Params$Resource$Sitemaps$Get;
type SubmitSitemapParams = webmasters_v3.Params$Resource$Sitemaps$Submit;
type DeleteSitemapParams = webmasters_v3.Params$Resource$Sitemaps$Delete;
type InspectRequest =
  searchconsole_v1.Params$Resource$Urlinspection$Index$Inspect['requestBody'];

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------

export class GSCError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'GSCError';
  }
}

export class GSCAuthError extends GSCError {
  constructor(message?: string) {
    super(
      message ??
        'Authentication failed. Check GOOGLE_APPLICATION_CREDENTIALS points to a valid service account key.',
      'AUTH_ERROR',
      401,
    );
    this.name = 'GSCAuthError';
  }
}

export class GSCQuotaError extends GSCError {
  constructor(message?: string) {
    super(
      message ?? 'API quota exceeded. Wait a moment and retry, or reduce request frequency.',
      'QUOTA_ERROR',
      429,
    );
    this.name = 'GSCQuotaError';
  }
}

export class GSCPermissionError extends GSCError {
  constructor(siteUrl: string) {
    super(
      `No access to "${siteUrl}". Verify the service account has been added as a user in Search Console for this property.`,
      'PERMISSION_ERROR',
      403,
    );
    this.name = 'GSCPermissionError';
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SearchConsoleService {
  private auth: GoogleAuth;

  constructor(credentials: string) {
    this.auth = new google.auth.GoogleAuth({
      keyFile: credentials,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });
  }

  private async getWebmasters() {
    const authClient = await this.auth.getClient();
    return google.webmasters({
      version: 'v3',
      auth: authClient,
    } as webmasters_v3.Options);
  }

  private async getSearchConsole() {
    const authClient = await this.auth.getClient();
    return google.searchconsole({
      version: 'v1',
      auth: authClient,
    } as searchconsole_v1.Options);
  }

  private normalizeUrl(url: string): string {
    if (url.startsWith('sc-domain:')) return url;
    try {
      const parsed = new URL(url);
      return `sc-domain:${parsed.hostname}`;
    } catch {
      return url;
    }
  }

  /**
   * Classify Google API errors into actionable custom error types.
   */
  private classifyError(err: unknown, context?: string): never {
    if (!(err instanceof Error)) throw err;

    const msg = err.message.toLowerCase();
    const status = (err as unknown as Record<string, unknown>).code as number | undefined;

    if (status === 401 || msg.includes('authentication') || msg.includes('credentials')) {
      throw new GSCAuthError();
    }
    if (status === 429 || msg.includes('quota') || msg.includes('rate limit')) {
      throw new GSCQuotaError();
    }
    if (status === 403 || msg.includes('permission')) {
      throw new GSCPermissionError(context ?? 'unknown');
    }

    throw err;
  }

  private async withPermissionFallback<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
    siteUrl?: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('permission')
      ) {
        try {
          return await fallback();
        } catch {
          // Both failed — throw actionable error
          throw new GSCPermissionError(siteUrl ?? 'unknown');
        }
      }
      this.classifyError(err, siteUrl);
    }
  }

  // ---------------------------------------------------------------------------
  // Sites
  // ---------------------------------------------------------------------------

  async listSites() {
    return withRetry(async () => {
      const wm = await this.getWebmasters();
      return wm.sites.list();
    });
  }

  // ---------------------------------------------------------------------------
  // Search Analytics
  // ---------------------------------------------------------------------------

  async searchAnalytics(siteUrl: string, body: SearchAnalyticsRequest) {
    return withRetry(async () => {
      const wm = await this.getWebmasters();
      return this.withPermissionFallback(
        () => wm.searchanalytics.query({ siteUrl, requestBody: body }),
        () =>
          wm.searchanalytics.query({
            siteUrl: this.normalizeUrl(siteUrl),
            requestBody: body,
          }),
        siteUrl,
      );
    });
  }

  // ---------------------------------------------------------------------------
  // URL Inspection
  // ---------------------------------------------------------------------------

  async indexInspect(body: InspectRequest) {
    return withRetry(async () => {
      const sc = await this.getSearchConsole();
      return sc.urlInspection.index.inspect({ requestBody: body });
    });
  }

  // ---------------------------------------------------------------------------
  // Sitemaps
  // ---------------------------------------------------------------------------

  async listSitemaps(params: ListSitemapsParams) {
    return withRetry(async () => {
      const wm = await this.getWebmasters();
      return this.withPermissionFallback(
        () => wm.sitemaps.list(params),
        () =>
          wm.sitemaps.list({
            ...params,
            siteUrl: this.normalizeUrl(params.siteUrl!),
          }),
        params.siteUrl,
      );
    });
  }

  async getSitemap(params: GetSitemapParams) {
    return withRetry(async () => {
      const wm = await this.getWebmasters();
      return this.withPermissionFallback(
        () => wm.sitemaps.get(params),
        () =>
          wm.sitemaps.get({
            ...params,
            siteUrl: this.normalizeUrl(params.siteUrl!),
          }),
        params.siteUrl,
      );
    });
  }

  async submitSitemap(params: SubmitSitemapParams) {
    return withRetry(async () => {
      const wm = await this.getWebmasters();
      return this.withPermissionFallback(
        () => wm.sitemaps.submit(params),
        () =>
          wm.sitemaps.submit({
            ...params,
            siteUrl: this.normalizeUrl(params.siteUrl!),
          }),
        params.siteUrl,
      );
    });
  }

  async deleteSitemap(params: DeleteSitemapParams) {
    return withRetry(async () => {
      const wm = await this.getWebmasters();
      return this.withPermissionFallback(
        () => wm.sitemaps.delete(params),
        () =>
          wm.sitemaps.delete({
            ...params,
            siteUrl: this.normalizeUrl(params.siteUrl!),
          }),
        params.siteUrl,
      );
    });
  }
}
