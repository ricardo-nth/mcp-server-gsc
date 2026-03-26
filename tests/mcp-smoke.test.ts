import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const next = cleanupPaths.pop();
    if (!next) continue;
    rmSync(next, { recursive: true, force: true });
  }
});

describe('MCP stdio smoke test', () => {
  it('boots the built server and lists expected tools', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'gsc-mcp-smoke-'));
    cleanupPaths.push(tempDir);

    const fakeCredsPath = join(tempDir, 'fake-creds.json');
    writeFileSync(
      fakeCredsPath,
      JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key_id: 'fake',
        private_key: '-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n',
        client_email: 'fake@example.com',
        client_id: '1234567890',
      }),
    );

    const stderrChunks: string[] = [];
    const transport = new StdioClientTransport({
      command: 'node',
      args: [resolve(process.cwd(), 'dist/index.js')],
      cwd: process.cwd(),
      env: {
        ...process.env,
        GOOGLE_APPLICATION_CREDENTIALS: fakeCredsPath,
        GSC_RUNTIME_STATE_PATH: join(tempDir, 'runtime-state.json'),
      } as Record<string, string>,
      stderr: 'pipe',
    });

    const stderrStream = transport.stderr;
    if (stderrStream) {
      stderrStream.on('data', (chunk) => {
        stderrChunks.push(String(chunk));
      });
    }

    const client = new Client(
      { name: 'mcp-smoke-test', version: '1.0.0' },
      { capabilities: {} },
    );

    try {
      await client.connect(transport);
      const response = await client.listTools();
      const toolNames = response.tools.map((tool) => tool.name);

      expect(toolNames).toContain('list_sites');
      expect(toolNames).toContain('health_snapshot');
      expect(toolNames).toContain('search_analytics');
      expect(toolNames.length).toBeGreaterThanOrEqual(35);
    } catch (error) {
      const stderr = stderrChunks.join('').trim();
      const message =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        stderr.length > 0 ? `${message}\nServer stderr:\n${stderr}` : message,
      );
    } finally {
      await client.close();
    }
  });
});
