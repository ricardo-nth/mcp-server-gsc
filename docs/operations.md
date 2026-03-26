# Operations Runbook

Phase 6 introduces built-in observability for runtime operations, plus lightweight persistence for quota and idempotency state.

## Telemetry Events

Every tool call emits a structured telemetry event to stderr (JSON line, prefixed with `[telemetry]`) when telemetry is enabled.

Fields:

- `timestamp`
- `requestId`
- `toolName`
- `mode`
- `status`
- `latencyMs`
- `retries`
- `quotaUnitsEstimated`
- `quotaUnitsReserved`
- `cacheHit`
- `idempotencyReplay`
- `errorCode` and `errorMessage` (on failures)

## Debug Mode Traces

Set `GSC_DEBUG_MODE=true` to include redacted request/response traces in response metadata (`debugTrace`).

Redaction behavior:

- Secret-like keys (`apiKey`, `token`, `password`, `authorization`, etc.) are replaced with `[REDACTED]`
- Bearer tokens become `Bearer [REDACTED_TOKEN]`
- Emails are replaced with `[REDACTED_EMAIL]`
- Long token-like strings are replaced with `[REDACTED_LONG_TOKEN]`

## Runtime Health Snapshot

Use `health_snapshot` to inspect operational state without external API calls.

It reports:

- Cache and idempotency entry counts + TTL settings
- Persistence status, state file path, and last load/save timestamps
- Global and per-tool concurrency queues
- Quota budget usage + remaining headroom
- Per-tool success/failure/latency counters
- Current observability mode flags

## Runtime State Persistence

The server persists only the operational state that helps with restart continuity:

- Daily quota guardrail usage
- Idempotency replay records

It does not persist:

- Response cache entries
- Tool metrics counters
- Concurrency queue state

Default state file path:

- `~/.mcp-server-gsc-pro/runtime-state.json`

Behavior:

- Missing state file: startup continues with a clean runtime
- Corrupt or invalid state file: the server logs a warning to stderr, ignores the file, and starts clean
- Writes are atomic: a temporary file is written in the same directory and then renamed into place
- Expired idempotency records are purged on load and before save

## Environment Variables

- `GSC_TELEMETRY_ENABLED` (default: `true`)
- `GSC_DEBUG_MODE` (default: `false`)
- `GSC_RUNTIME_STATE_PATH` (override state file path; set to an empty string to disable persistence)
- Existing runtime controls (`GSC_CACHE_TTL_SEC`, `GSC_GLOBAL_CONCURRENCY`, quota budgets, etc.) continue to apply
