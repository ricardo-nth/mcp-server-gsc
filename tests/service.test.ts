import { describe, it, expect } from 'vitest';
import {
  SearchConsoleService,
  GSCAuthError,
  GSCPermissionError,
} from '../src/service.js';

describe('SearchConsoleService error classification', () => {
  it('listSites converts auth failures into GSCAuthError', async () => {
    const service = new SearchConsoleService('/tmp/fake-creds.json');
    const authError = Object.assign(new Error('invalid credentials'), {
      code: 401,
    });

    (service as unknown as { getWebmasters: () => Promise<unknown> }).getWebmasters =
      async () =>
        ({
          sites: {
            list: async () => {
              throw authError;
            },
          },
        });

    await expect(service.listSites()).rejects.toBeInstanceOf(GSCAuthError);
  });

  it('indexInspect converts 403 errors into GSCPermissionError with context', async () => {
    const service = new SearchConsoleService('/tmp/fake-creds.json');
    const permissionError = Object.assign(new Error('forbidden'), { code: 403 });

    (service as unknown as { getSearchConsole: () => Promise<unknown> }).getSearchConsole =
      async () =>
        ({
          urlInspection: {
            index: {
              inspect: async () => {
                throw permissionError;
              },
            },
          },
        });

    await expect(
      service.indexInspect({
        siteUrl: 'sc-domain:example.com',
        inspectionUrl: 'https://example.com/page',
      }),
    ).rejects.toBeInstanceOf(GSCPermissionError);
  });

  it('indexInspect converts response.status 403 failures into GSCPermissionError', async () => {
    const service = new SearchConsoleService('/tmp/fake-creds.json');
    const permissionError = Object.assign(new Error('forbidden'), {
      response: { status: 403 },
    });

    (service as unknown as { getSearchConsole: () => Promise<unknown> }).getSearchConsole =
      async () =>
        ({
          urlInspection: {
            index: {
              inspect: async () => {
                throw permissionError;
              },
            },
          },
        });

    await expect(
      service.indexInspect({
        siteUrl: 'sc-domain:example.com',
        inspectionUrl: 'https://example.com/page',
      }),
    ).rejects.toBeInstanceOf(GSCPermissionError);
  });

  it('getSite preserves non-permission fallback errors', async () => {
    const service = new SearchConsoleService('/tmp/fake-creds.json');
    const fallbackError = Object.assign(new Error('bad request'), { code: 400 });

    (service as unknown as { getWebmasters: () => Promise<unknown> }).getWebmasters =
      async () =>
        ({
          sites: {
            get: async (params: { siteUrl: string }) => {
              if (params.siteUrl === 'https://example.com/') {
                throw Object.assign(new Error('permission denied'), { code: 403 });
              }
              throw fallbackError;
            },
          },
        });

    await expect(service.getSite('https://example.com/')).rejects.toBe(fallbackError);
  });
});
