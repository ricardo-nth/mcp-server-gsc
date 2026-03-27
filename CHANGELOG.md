# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- Additive workflow report contract groundwork for `run_seo_audit_workflow`, including `reportFormat`, `reportPack`, `detailMode`, optional brand metadata, and a shared `report` payload alongside the existing workflow sections.
- Branded HTML workflow report rendering for `run_seo_audit_workflow`, including `htmlReport` output and `reportFormat: "html" | "all"` support for print-ready client handoff.
- Workflow report packs for `monthly_seo`, `technical_audit`, `indexing_recovery`, and `content_opportunities`, with profile compatibility validation and pack-specific report context.
- Professional workflow handoff outputs for `run_seo_audit_workflow`, including deterministic `issues` and `actions`, severity/impact/effort metadata, ownership routing, client summaries, and analyst detail mode support.
- Internal provider abstraction and registry foundations for backlinks, keyword difficulty, competitor overlap, and traffic estimate integrations, with additive `health_snapshot` provider diagnostics.
- Ahrefs scaffold provider registered by default in scaffold mode, backed by deterministic fixtures so provider contracts and operations diagnostics are testable before live API wiring.
- Expanded `recommend_next_actions` with branded vs non-branded opportunity segmentation, derived brand-term detection, and page template grouping for stronger native SEO prioritization.
- Upgraded `cannibalization_resolver` with branded segmentation, intent/cluster/template context, severity scoring, and stronger action metadata for redirect/consolidate/differentiate recommendations.

### Planned

- Client-ready HTML report rendering for SEO workflows, with branded templates that can be exported to PDF deliverables.
- Report packs for common agency use cases such as monthly SEO updates, technical audits, indexing recovery, and content opportunity reviews.
- Provider abstractions for external SEO data sources so backlink, keyword difficulty, competitor, and traffic-estimate integrations can plug in cleanly later.
- Ahrefs-ready integration scaffolding built against provider interfaces and test fixtures, so the implementation can land cleanly once API access is available.
- Stronger professional workflow outputs including issue severity, impact/effort scoring, action ownership, analyst detail mode, and client-safe summaries.
- Expanded native SEO intelligence on top of Search Console data, including branded vs non-branded segmentation, intent clustering, template grouping, anomaly detection, and stronger cannibalization/action recommendations.

## [1.2.3] - 2026-03-26

### Added

- Phase 6 observability hardening: structured telemetry events, per-tool counters, debug redacted traces, and `health_snapshot` runtime diagnostics.
- Operations runbook at `docs/operations.md`.
- Golden response contract tests, property-based scoring tests, service contract tests, load behavior tests, and regression fixtures.
- Release/process hygiene docs: `docs/releasing.md`, migration templates, and PR/issue templates.
- Runtime state persistence for quota guardrails and idempotency replay records, with additive `health_snapshot` persistence metadata.
- Release automation scripts for docs drift checks, release metadata checks, MCP smoke testing, and package dry-run verification.

### Changed

- Enforced roadmap governance docs for response-shape changes and compatibility checks.
- Consolidated MCP tool metadata into a shared runtime registry that now drives both `ListTools` and generated README tool docs.

## [1.2.2] - 2026-03-03

### Added

- Phase 5 workflow orchestration and related schema/tool enhancements.
