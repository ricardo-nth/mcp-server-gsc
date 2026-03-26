import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

import type { ToolResult } from './types.js';

const RUNTIME_STATE_SCHEMA_VERSION = '1';

export interface PersistedQuotaState {
  day: string;
  globalUsed: number;
  perToolUsed: Record<string, number>;
}

export interface PersistedIdempotencyEntry {
  key: string;
  storedAt: number;
  ttlMs: number;
  value: ToolResult;
}

export interface PersistedRuntimeState {
  schemaVersion: string;
  savedAt: string;
  quotaState: PersistedQuotaState;
  idempotency: PersistedIdempotencyEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parsePersistedState(value: unknown): PersistedRuntimeState {
  if (!isRecord(value)) {
    throw new Error('State file must contain a JSON object.');
  }
  if (value.schemaVersion !== RUNTIME_STATE_SCHEMA_VERSION) {
    throw new Error(`Unsupported state schema version: ${String(value.schemaVersion)}.`);
  }
  if (typeof value.savedAt !== 'string') {
    throw new Error('State file is missing a valid savedAt timestamp.');
  }

  const quotaStateValue = value.quotaState;
  if (!isRecord(quotaStateValue)) {
    throw new Error('State file is missing quotaState.');
  }
  if (typeof quotaStateValue.day !== 'string') {
    throw new Error('State file quotaState.day must be a string.');
  }
  if (!isFiniteNumber(quotaStateValue.globalUsed) || quotaStateValue.globalUsed < 0) {
    throw new Error('State file quotaState.globalUsed must be a non-negative number.');
  }
  if (!isRecord(quotaStateValue.perToolUsed)) {
    throw new Error('State file quotaState.perToolUsed must be an object.');
  }

  const perToolUsed = Object.entries(quotaStateValue.perToolUsed).reduce<Record<string, number>>(
    (acc, [toolName, units]) => {
      if (!isFiniteNumber(units) || units < 0) {
        throw new Error(`State file quotaState.perToolUsed["${toolName}"] must be a non-negative number.`);
      }
      acc[toolName] = units;
      return acc;
    },
    {},
  );

  const idempotencyValue = value.idempotency;
  if (!Array.isArray(idempotencyValue)) {
    throw new Error('State file idempotency must be an array.');
  }

  const idempotency = idempotencyValue.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`State file idempotency[${index}] must be an object.`);
    }
    if (typeof entry.key !== 'string' || entry.key.length === 0) {
      throw new Error(`State file idempotency[${index}].key must be a non-empty string.`);
    }
    if (!isFiniteNumber(entry.storedAt) || entry.storedAt < 0) {
      throw new Error(`State file idempotency[${index}].storedAt must be a non-negative number.`);
    }
    if (!isFiniteNumber(entry.ttlMs) || entry.ttlMs < 0) {
      throw new Error(`State file idempotency[${index}].ttlMs must be a non-negative number.`);
    }
    if (!isRecord(entry.value)) {
      throw new Error(`State file idempotency[${index}].value must be an object.`);
    }

    return {
      key: entry.key,
      storedAt: entry.storedAt,
      ttlMs: entry.ttlMs,
      value: entry.value as ToolResult,
    };
  });

  return {
    schemaVersion: RUNTIME_STATE_SCHEMA_VERSION,
    savedAt: value.savedAt,
    quotaState: {
      day: quotaStateValue.day,
      globalUsed: quotaStateValue.globalUsed,
      perToolUsed,
    },
    idempotency,
  };
}

export function getDefaultRuntimeStatePath(): string | null {
  const home = homedir();
  if (!home) {
    return null;
  }
  return join(home, '.mcp-server-gsc-pro', 'runtime-state.json');
}

export function resolveRuntimeStatePath(override?: string | null): string | null {
  if (override === null) {
    return null;
  }
  if (typeof override === 'string') {
    const trimmed = override.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return getDefaultRuntimeStatePath();
}

export function readRuntimeState(path: string): {
  state: PersistedRuntimeState | null;
  error: string | null;
} {
  if (!existsSync(path)) {
    return { state: null, error: null };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return { state: parsePersistedState(parsed), error: null };
  } catch (error) {
    return {
      state: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function writeRuntimeState(path: string, state: PersistedRuntimeState): {
  savedAt: string | null;
  error: string | null;
} {
  let tempPath: string | null = null;

  try {
    mkdirSync(dirname(path), { recursive: true });
    tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, JSON.stringify(state, null, 2));
    renameSync(tempPath, path);
    return { savedAt: state.savedAt, error: null };
  } catch (error) {
    if (tempPath && existsSync(tempPath)) {
      try {
        unlinkSync(tempPath);
      } catch {
        // Best effort cleanup.
      }
    }
    return {
      savedAt: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
