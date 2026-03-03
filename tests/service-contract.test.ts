import { describe, it, expect, vi } from 'vitest';
import { SearchConsoleService } from '../src/service.js';

describe('Service API contract tests', () => {
  it('searchAnalytics sends requestBody and siteUrl to webmasters endpoint', async () => {
    const query = vi.fn().mockResolvedValue({ data: { rows: [] } });
    const service = new SearchConsoleService('/tmp/fake-creds.json');

    (service as unknown as { getWebmasters: () => Promise<unknown> }).getWebmasters = async () => ({
      searchanalytics: {
        query,
      },
    });

    await service.searchAnalytics('sc-domain:example.com', {
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      dimensions: ['query'],
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        siteUrl: 'sc-domain:example.com',
        requestBody: expect.objectContaining({ startDate: '2026-02-01', endDate: '2026-02-28' }),
      }),
    );
  });

  it('indexInspect calls URL inspection endpoint with requestBody wrapper', async () => {
    const inspect = vi.fn().mockResolvedValue({ data: { inspectionResult: {} } });
    const service = new SearchConsoleService('/tmp/fake-creds.json');

    (service as unknown as { getSearchConsole: () => Promise<unknown> }).getSearchConsole = async () => ({
      urlInspection: {
        index: {
          inspect,
        },
      },
    });

    await service.indexInspect({
      siteUrl: 'sc-domain:example.com',
      inspectionUrl: 'https://example.com/a',
    });

    expect(inspect).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          inspectionUrl: 'https://example.com/a',
        }),
      }),
    );
  });

  it('indexingPublish calls indexing API with URL notification payload', async () => {
    const publish = vi.fn().mockResolvedValue({ data: { urlNotificationMetadata: {} } });
    const service = new SearchConsoleService('/tmp/fake-creds.json');

    (service as unknown as { getIndexing: () => Promise<unknown> }).getIndexing = async () => ({
      urlNotifications: {
        publish,
      },
    });

    await service.indexingPublish('https://example.com/page', 'URL_UPDATED');

    expect(publish).toHaveBeenCalledWith({
      requestBody: {
        url: 'https://example.com/page',
        type: 'URL_UPDATED',
      },
    });
  });

  it('cruxQueryRecord sends metrics/formFactor payload and API key', async () => {
    const queryRecord = vi.fn().mockResolvedValue({ data: { record: {} } });
    const service = new SearchConsoleService('/tmp/fake-creds.json', 'test-crux-key');

    (service as unknown as { getCrUX: () => unknown }).getCrUX = () => ({
      records: {
        queryRecord,
      },
    });

    await service.cruxQueryRecord({
      origin: 'https://example.com',
      formFactor: 'PHONE',
      metrics: ['largest_contentful_paint'],
    });

    expect(queryRecord).toHaveBeenCalledWith({
      key: 'test-crux-key',
      requestBody: {
        url: undefined,
        origin: 'https://example.com',
        formFactor: 'PHONE',
        metrics: ['largest_contentful_paint'],
      },
    });
  });
});
