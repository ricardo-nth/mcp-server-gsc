# Operations Runbook

Phase 6 introduces built-in observability for runtime operations.

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

Use `health_snapshot` to inspect in-memory operational state without external API calls.

It reports:

- Cache and idempotency entry counts + TTL settings
- Global and per-tool concurrency queues
- Quota budget usage + remaining headroom
- Per-tool success/failure/latency counters
- Current observability mode flags

## Environment Variables

- `GSC_TELEMETRY_ENABLED` (default: `true`)
- `GSC_DEBUG_MODE` (default: `false`)
- Existing runtime controls (`GSC_CACHE_TTL_SEC`, `GSC_GLOBAL_CONCURRENCY`, quota budgets, etc.) continue to apply
