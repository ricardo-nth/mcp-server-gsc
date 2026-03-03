# MCP Server GSC Pro Roadmap

Purpose: turn `mcp-server-gsc-pro` into the best-in-class SEO MCP for autonomous AI agents by shipping improvements in clear phases with checklists.

## How To Use This Roadmap

1. Treat each phase as a mini-release.
2. Keep scope tight: finish checklist items before expanding.
3. For each item, add tests and README updates in the same PR.
4. Mark items complete with `[x]` and link the PR.

## Phase 0: Baseline And Release Hygiene

Goal: keep shipping confidence high as roadmap complexity increases.

- [ ] Add CI gate for `lint + test + build` on every push/PR (if not already enforced in repo settings)
- [ ] Add changelog discipline (`CHANGELOG.md` or release notes section)
- [ ] Add versioned migration notes for output schema changes
- [ ] Add a “breaking change” checklist for tool input/output evolution

## Phase 1: Agent Ergonomics Foundation

Goal: make tool calls easier, faster, and more deterministic for agents.

- [x] Add `schemaVersion` to every tool response
- [x] Add response modes (`mode: "compact" | "full"`) for high-token payloads
- [x] Add summary envelope to all responses:
  - [x] `whatChanged`
  - [x] `whyItMatters`
  - [x] `suggestedNextTool`
- [x] Add consistent `requestId` to every response
- [x] Add richer MCP tool metadata (cost/latency/quota hints)
- [x] Add concrete schema examples in tool descriptions where useful

## Phase 2: Reliability, Quota, And Throughput

Goal: improve resilience under multi-agent and high-volume usage.

- [x] Add in-memory response caching with TTL + cache metadata fields:
  - [x] `cacheHit`
  - [x] `cacheAgeSec`
  - [x] `cacheKey`
- [x] Add per-tool and global concurrency controls
- [x] Add configurable quota budget guardrails (fail-fast before quota burn)
- [x] Add cursor/stream style retrieval for large analytics datasets
- [x] Add idempotency keys for mutating actions (`indexing_publish`, etc.)

## Phase 3: Intelligence Layer V1

Goal: convert raw analytics into actionable decisions.

- [x] Add `recommend_next_actions` tool with deterministic ranked actions
- [x] Add opportunity scoring model combining:
  - [x] click upside
  - [x] impression volume
  - [x] rank distance
  - [x] indexing health
  - [x] CWV quality
- [x] Add confidence scoring and rationale for each recommendation
- [x] Add expected impact buckets (low/medium/high) with simple formulas

## Phase 4: SEO-Specific Advanced Analysis

Goal: deepen SEO usefulness beyond basic KPI inspection.

- [ ] Add query clustering + intent labeling
- [ ] Add page template segmentation (blog/docs/product/location/etc.)
- [ ] Add seasonal anomaly detection for drop alerts
- [ ] Add change-point detection for CTR/position trends
- [ ] Extend `indexing_health_report` source options:
  - [ ] `sitemap`
  - [ ] combined sources with deduplication

## Phase 5: Orchestrated Agent Workflows

Goal: make multi-step audits one call away for agents.

- [ ] Add `run_seo_audit_workflow` tool orchestrator
- [ ] Add configurable workflow profiles:
  - [ ] technical SEO
  - [ ] content performance
  - [ ] indexing recovery
- [ ] Return executive summary + drilldown sections optimized for both AI + human handoff
- [ ] Add optional Markdown-ready report payloads

## Phase 6: Observability And Operations

Goal: improve debuggability and production operations.

- [ ] Add structured telemetry events (tool name, latency, retries, quota estimates)
- [ ] Add per-tool success/failure counters
- [ ] Add debug mode with redacted request/response traces
- [ ] Add “health snapshot” tool for runtime diagnostics

## Cross-Cutting Testing Plan

- [ ] Golden tests for tool response shape stability
- [ ] Property-based tests for scoring/recommendation logic
- [ ] Contract tests for each external API integration
- [ ] Load tests for pagination/stream/concurrency behavior
- [ ] Regression fixtures for known SEO edge cases

## Suggested Release Sequence

1. `v1.3`: Phase 1 + caching from Phase 2 + `recommend_next_actions` skeleton
2. `v1.4`: remaining Phase 2 + opportunity scoring
3. `v1.5`: Phase 4 advanced SEO analytics
4. `v1.6`: Phase 5 orchestrator workflows
5. `v1.7`: Phase 6 observability hardening

## Immediate Next Sprint Proposal

If you want a focused start, ship this first:

- [ ] `schemaVersion` + response `mode`
- [ ] cache layer + metadata fields
- [ ] `recommend_next_actions` (MVP)
- [ ] tests + README examples for the above

## Detailed Phase Specs

This section scopes each phase so implementation can start without re-planning.

### Phase 0 Spec

Scope in:

- CI policy and required status checks
- release notes/changelog workflow
- migration note template for output changes
- breaking-change checklist for PRs

Scope out:

- any runtime/server behavior changes
- new tools or schemas

Deliverables:

- `CHANGELOG.md` introduced (or documented release-notes policy)
- `docs/migrations/` folder with first migration template
- `docs/releasing.md` with exact release commands
- PR template checklist for API/output compatibility

Acceptance criteria:

- PR cannot merge unless lint/test/build pass
- at least one release entry follows the new format
- migration template includes `before/after` payload examples

### Phase 1 Spec

Scope in:

- response contract standardization for all tools
- `schemaVersion`, `requestId`, and response `mode`
- summary envelope fields for every response
- richer tool metadata exposed in `ListTools`

Scope out:

- caching, throttling, or quota controls
- scoring/recommendation intelligence

Deliverables:

- shared response builder utility in `src/utils/`
- all tool handlers return the standardized response envelope
- schema/docs examples updated for top 10 highest-use tools first, then all
- tests validating envelope presence on success and error payloads

Acceptance criteria:

- every tool response includes `schemaVersion` and `requestId`
- `mode=compact` measurably reduces payload size for large tools
- `suggestedNextTool` is always a valid known tool name when present

Dependencies:

- Phase 0 completed for migration/change notes

### Phase 2 Spec

Scope in:

- cache layer with TTL and metadata
- global and per-tool concurrency limits
- quota budgets and preflight quota guardrails
- cursor/stream retrieval for large analytics
- idempotency support for mutating tools

Scope out:

- recommendation/scoring semantics
- query clustering or anomaly modeling

Deliverables:

- cache middleware module with deterministic cache key strategy
- concurrency limiter utility used by all multi-call handlers
- quota policy config (`env` + defaults) and explicit quota errors
- new paginated/cursor tool variant for analytics high-volume flows
- idempotency key support for `indexing_publish`

Acceptance criteria:

- repeated identical read requests hit cache within TTL
- concurrent callers do not exceed configured limits
- mutating retries with same idempotency key are safe
- stream/cursor path can retrieve 100k+ rows without single huge response

Dependencies:

- Phase 1 response contract finalized

### Phase 3 Spec

Scope in:

- `recommend_next_actions` tool
- opportunity scoring and confidence model
- deterministic rationale + impact banding

Scope out:

- orchestration workflows
- advanced clustering/change-point models

Deliverables:

- `schemas/recommendations.ts` + `tools/recommendations.ts`
- scoring utilities in `src/utils/scoring.ts`
- config constants for score weights and thresholds
- fixtures for known scenarios (quick wins, indexing issues, CWV drag)

Acceptance criteria:

- recommendations are stable (same input => same ranking)
- each action includes score, confidence, impact, and rationale
- top recommendation has traceable reason fields

Dependencies:

- Phase 2 cache/concurrency ready for multi-source computation

### Phase 4 Spec

Scope in:

- query clustering and intent classification
- page template segmentation support
- seasonal anomaly and change-point detection
- sitemap source integration in `indexing_health_report`

Scope out:

- full workflow orchestration
- operational telemetry dashboards

Deliverables:

- clustering utility module with deterministic labels
- template mapping input contract (pattern/rule-based)
- anomaly detection utilities with configurable sensitivity
- `indexing_health_report` supports `sitemap` and merged-source modes

Acceptance criteria:

- cannibalization and quick-wins can optionally run intent-aware mode
- drop alerts suppress expected seasonal dips when enabled
- merged indexing sources deduplicate URLs correctly

Dependencies:

- Phase 3 scoring outputs available for reuse

### Phase 5 Spec

Scope in:

- `run_seo_audit_workflow` orchestration tool
- profile-based audit templates
- executive summary + deep sections + markdown output mode

Scope out:

- full observability stack
- external storage/persistence layer

Deliverables:

- workflow engine wrapper that calls existing tools in ordered steps
- profile config definitions (`technical`, `content`, `indexing`)
- markdown renderer for report payloads
- partial-failure tolerant workflow responses with per-step statuses

Acceptance criteria:

- one call returns usable action plan for each profile
- failures in one step do not invalidate all sections
- markdown output is copy-ready for docs/issues/slack

Dependencies:

- Phase 1 response envelope and Phase 3 recommendations

### Phase 6 Spec

Scope in:

- telemetry events
- success/failure counters and latency metrics
- debug mode with redacted traces
- runtime health diagnostics tool

Scope out:

- external observability platform lock-in
- nonessential UI/dashboarding work

Deliverables:

- telemetry interface and default logger implementation
- redaction utility for secrets and PII
- `health_snapshot` (or equivalent) tool
- operational runbook docs (`docs/operations.md`)

Acceptance criteria:

- each tool call emits standardized telemetry fields
- debug mode never leaks credential values
- health tool reports cache/concurrency/quota runtime state

Dependencies:

- all previous phases merged

## Working Cadence And Governance

- [ ] Open one tracking issue per phase linking checklist items
- [ ] Use one feature branch per phase, but ship in small PR slices
- [ ] Require contract tests for any response-shape change
- [ ] Document every new tool in README table + usage example
