# PRD: Monthly SEO Client Report Polish

## Problem

The current `monthly_seo` report is already useful, but it still reads too much like an internal SEO workflow output. Clients can see the data, but they still need help understanding:

- what actually improved
- what the numbers mean
- whether anything needs their attention
- what will happen next

The report is strongest as an analyst tool today. It needs another pass to become a polished recurring client deliverable.

## Product Goal

Make the monthly SEO report feel like something an agency can confidently send to a client every month without rewriting it by hand.

## Primary Users

- Agency operator or consultant preparing monthly SEO updates
- Business owner reading the report for a quick progress check
- Secondary: analyst reviewing appendix-level detail when needed

## User Needs

### Agency operator

- I need a report that already tells the story of the month.
- I need it to highlight the next best actions without writing a custom summary every time.
- I need it to look professional enough to send directly.

### Business owner

- I need to understand quickly whether SEO is moving in the right direction.
- I need plain-English explanations, not just metrics.
- I need to know if I need to do anything or if the agency is handling the next steps.

## Success Criteria

- A client can understand the report’s main message in under two minutes
- The top section clearly states performance movement and next actions
- The report can be shared without manual cleanup in most cases
- Main report sections feel readable on laptop screens and in PDF export
- Analyst detail remains available without overwhelming the client-facing narrative

## Core Requirements

### 1. TL;DR and next actions

Add a short top-of-report summary that answers:

- what improved
- what needs watching
- what the next best actions are
- whether those actions are for the agency or the client

### 2. KPI summary with interpretation

Keep KPI cards, but add short interpretation so the user understands the movement without reading raw deltas alone.

### 3. Lightweight visuals

Add simple visuals for KPI movement so trends are obvious at a glance. These should remain print-safe and work in HTML export.

### 4. Better client-facing tables

Rework query/page sections so the main report emphasizes:

- best performers
- improving performers
- meaningful movement

The tables should avoid horizontal overflow for essential content and hide lower-value detail from the client-facing view.

### 5. Plain-English narrative

Rewrite main report copy in business-owner language. Avoid phrases that sound like internal SEO tooling or debug output.

### 6. Stronger action framing

Actions should say:

- what we are doing next
- why it matters
- who owns it

Client-facing actions should not read like internal task objects.

## Non-Goals

- Building scheduling or delivery automation in this phase
- Reworking non-monthly report packs
- Adding account-management CRM features
- Solving historical report storage

## Constraints

- Preserve the existing additive workflow contract
- Do not break current `json`, `markdown`, `html`, or `all` output behavior
- Keep HTML export printable
- Prefer lightweight visuals over heavy front-end dependencies

## Open Questions

- Should the client-facing version explicitly label whether an action is “agency-led” or “client input needed”?
- Should charts appear in markdown at all, or only in HTML?
- Should we add a stricter “client mode” for tables that removes some columns entirely?

## Suggested Milestone

Treat this as a short polish milestone that can be completed in a focused follow-up session before public release.
