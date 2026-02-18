import {
  google,
  searchconsole_v1,
  webmasters_v3,
  indexing_v3,
  pagespeedonline_v5,
  chromeuxreport_v1,
} from 'googleapis';
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
  private apiKey?: string;

  constructor(credentials: string, apiKey?: string) {
    this.apiKey = apiKey;
    this.auth = new google.auth.GoogleAuth({
      keyFile: credentials,
      scopes: [
        'https://www.googleapis.com/auth/webmasters',
        'https://www.googleapis.com/auth/webmasters.readonly',
        'https://www.googleapis.com/auth/indexing',
      ],
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

  private async getIndexing() {
    const authClient = await this.auth.getClient();
    return google.indexing({
      version: 'v3',
      auth: authClient,
    } as indexing_v3.Options);
  }

  private getPageSpeed() {
    return google.pagespeedonline({ version: 'v5' } as pagespeedonline_v5.Options);
  }

  private getCrUX() {
    if (!this.apiKey) {
      throw new GSCError(
        'GOOGLE_CLOUD_API_KEY environment variable is required for CrUX API tools.',
        'CONFIG_ERROR',
      );
    }
    return google.chromeuxreport({ version: 'v1' } as chromeuxreport_v1.Options);
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
  private getStatusCode(err: unknown): number | undefined {
    if (typeof err === 'object' && err !== null) {
      const e = err as Record<string, unknown>;
      if (typeof e.code === 'number') return e.code;
      if (typeof e.status === 'number') return e.status;
      if (
        typeof e.response === 'object' &&
        e.response !== null &&
        typeof (e.response as Record<string, unknown>).status === 'number'
      ) {
        return (e.response as Record<string, unknown>).status as number;
      }
    }
    return undefined;
  }

  private classifyError(err: unknown, context?: string): never {
    if (!(err instanceof Error)) throw err;

    const msg = err.message.toLowerCase();
    const status = this.getStatusCode(err);

    if (status === 401 || msg.includes('authentication') || msg.includes('credentials')) {
      throw new GSCAuthError();
    }
    if (status === 429 || msg.includes('quota') || msg.includes('rate limit')) {
      throw new GSCQuotaError();
    }
    if (
      status === 403 ||
      msg.includes('permission') ||
      msg.includes('forbidden') ||
      msg.includes('not authorized')
    ) {
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
      const status = this.getStatusCode(err);
      if (
        status === 403 ||
        (err instanceof Error &&
          (err.message.toLowerCase().includes('permission') ||
            err.message.toLowerCase().includes('forbidden')))
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
      try {
        const wm = await this.getWebmasters();
        return await wm.sites.list();
      } catch (err) {
        this.classifyError(err);
      }
    });
  }

  async getSite(siteUrl: string) {
    return withRetry(async () => {
      const wm = await this.getWebmasters();
      return this.withPermissionFallback(
        () => wm.sites.get({ siteUrl }),
        () => wm.sites.get({ siteUrl: this.normalizeUrl(siteUrl) }),
        siteUrl,
      );
    });
  }

  async addSite(siteUrl: string) {
    return withRetry(async () => {
      const wm = await this.getWebmasters();
      return this.withPermissionFallback(
        () => wm.sites.add({ siteUrl }),
        () => wm.sites.add({ siteUrl: this.normalizeUrl(siteUrl) }),
        siteUrl,
      );
    });
  }

  async deleteSite(siteUrl: string) {
    return withRetry(async () => {
      const wm = await this.getWebmasters();
      return this.withPermissionFallback(
        () => wm.sites.delete({ siteUrl }),
        () => wm.sites.delete({ siteUrl: this.normalizeUrl(siteUrl) }),
        siteUrl,
      );
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
      try {
        const sc = await this.getSearchConsole();
        return await sc.urlInspection.index.inspect({ requestBody: body });
      } catch (err) {
        const context = (body?.siteUrl ?? body?.inspectionUrl) || undefined;
        this.classifyError(err, context);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Mobile-Friendly Test
  // ---------------------------------------------------------------------------

  async mobileFriendlyTest(url: string, requestScreenshot?: boolean) {
    return withRetry(async () => {
      try {
        const sc = await this.getSearchConsole();
        return await sc.urlTestingTools.mobileFriendlyTest.run({
          requestBody: { url, requestScreenshot: requestScreenshot ?? false },
        });
      } catch (err) {
        this.classifyError(err, url);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // PageSpeed Insights (no auth required)
  // ---------------------------------------------------------------------------

  async runPageSpeed(params: {
    url: string;
    categories?: string[];
    strategy?: string;
    locale?: string;
  }) {
    return withRetry(async () => {
      try {
        const psi = this.getPageSpeed();
        return await psi.pagespeedapi.runpagespeed({
          url: params.url,
          category: params.categories,
          strategy: params.strategy,
          locale: params.locale,
        });
      } catch (err) {
        this.classifyError(err, params.url);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Indexing API
  // ---------------------------------------------------------------------------

  async indexingPublish(url: string, type: 'URL_UPDATED' | 'URL_DELETED') {
    return withRetry(async () => {
      try {
        const idx = await this.getIndexing();
        return await idx.urlNotifications.publish({
          requestBody: { url, type },
        });
      } catch (err) {
        this.classifyError(err, url);
      }
    });
  }

  async indexingGetMetadata(url: string) {
    return withRetry(async () => {
      try {
        const idx = await this.getIndexing();
        return await idx.urlNotifications.getMetadata({ url });
      } catch (err) {
        this.classifyError(err, url);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Chrome UX Report (CrUX)
  // ---------------------------------------------------------------------------

  async cruxQueryRecord(params: {
    url?: string;
    origin?: string;
    formFactor?: string;
    metrics?: string[];
  }) {
    return withRetry(async () => {
      try {
        const crux = this.getCrUX();
        return await crux.records.queryRecord({
          key: this.apiKey,
          requestBody: {
            url: params.url,
            origin: params.origin,
            formFactor: params.formFactor,
            metrics: params.metrics,
          },
        });
      } catch (err) {
        this.classifyError(err);
      }
    });
  }

  async cruxQueryHistory(params: {
    url?: string;
    origin?: string;
    formFactor?: string;
    metrics?: string[];
  }) {
    return withRetry(async () => {
      try {
        const crux = this.getCrUX();
        return await crux.records.queryHistoryRecord({
          key: this.apiKey,
          requestBody: {
            url: params.url,
            origin: params.origin,
            formFactor: params.formFactor,
            metrics: params.metrics,
          },
        });
      } catch (err) {
        this.classifyError(err);
      }
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
