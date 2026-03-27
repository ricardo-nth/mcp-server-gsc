# Implementation Spec: Monthly SEO Client Report Polish

## Objective

Upgrade the `monthly_seo` report pack so the main report becomes more visual, more action-oriented, and easier for clients to understand, while keeping the current workflow/report contract backward compatible.

## Current State

The report already includes:

- KPI summary
- month-over-month narrative
- visibility wins
- popular searches
- top pages
- brand vs non-brand performance
- next month priorities
- analyst appendix

The main gaps are:

- not enough high-level interpretation near the top
- tables feel too analyst-heavy
- weak “wins” can still appear in client-facing sections
- some sections require horizontal scrolling
- action framing is useful but still not polished enough for business owners

## Proposed Report Structure

### 1. Hero

Keep:

- report title
- brand
- date range

Add:

- one-sentence outcome summary

### 2. TL;DR / What To Do Next

New section near the top with three short groups:

- `What improved`
- `What needs attention`
- `What we’re doing next`

Each group should have 1-3 short bullets maximum.

### 3. KPI Summary

Keep current KPI cards, but add:

- short subtext interpretation per KPI
- clearer wording for positive vs negative movement

### 4. KPI Trend Visuals

Add compact visuals for:

- clicks
- impressions
- CTR
- average position

Preferred implementation:

- lightweight inline SVG sparklines or similarly simple HTML/CSS visuals
- no charting dependency unless absolutely necessary

### 5. Month-over-Month Summary

Keep narrative section, but improve commentary rules:

- prioritize meaningful changes
- prefer action-oriented interpretation over raw delta restatement
- avoid celebrating rows with zero clicks unless framed as visibility growth

### 6. Queries and Pages

Split main report tables into clearer client-friendly views:

- `Top opportunities`
- `Pages gaining traction`
- `Pages to watch`

Reduce the number of visible columns in the main view.

Move lower-value detail to appendix or omit it from client mode.

### 7. Brand vs Non-Brand

Keep the section, but suppress weak output:

- hide empty or non-informative branded cards
- show the section only when it adds real insight

### 8. Next Actions

Replace current action card feel with clearer client wording:

- action
- why it matters
- owner
- urgency or sequencing note when relevant

Recommended ownership labels:

- `Agency action`
- `Client input needed`
- `Shared follow-up`

### 9. Analyst Appendix

Keep appendix available, but preserve the main report as client-first.

Appendix can continue to include:

- workflow steps
- supporting issues
- supporting actions
- more detailed row-level context

## Data Rules

### Win filtering

Client-facing “wins” should prefer rows with:

- clicks gained
- meaningful impression gains with improving position
- clear page-level traction

Avoid promoting rows that only add noise.

### Query and page ranking

Sort candidate rows using a stronger client-facing score, not just raw impressions.

Suggested ranking inputs:

- clicks delta
- impressions delta
- position improvement
- current clicks
- whether the row has crossed into clearer commercial/value territory

### URL normalization

Reduce confusion from near-duplicate URL variants where possible, especially:

- `www` vs non-`www`
- trailing slash differences when safely normalizable

## Responsive Layout Spec

- Main report should fit comfortably on common laptop widths without forcing horizontal scroll for core sections
- Main tables should use fewer columns in client mode
- Less essential metrics should collapse into subtext or appendix
- HTML must remain print-safe for PDF export

## Content Guidelines

- Use plain-English business language in the main report
- Avoid internal tool names in client-facing sections
- Avoid debug-style metric strings in primary tables
- Prefer “what this means” over “raw metric dump”

## Backward Compatibility

- Keep `run_seo_audit_workflow` interface unchanged
- Keep existing `report.sections.monthlySeo` additive
- Keep `markdownReport` and `htmlReport` outputs
- Keep analyst appendix available

## Validation Plan

- Add workflow tests for `TL;DR` section population
- Add tests that weak zero-click rows do not dominate primary “wins”
- Add renderer tests for non-scrolling core table layouts where practical
- Add HTML snapshot coverage for new chart/summary structure
- Re-run `pnpm lint`, targeted workflow tests, and `pnpm build`

## Recommended Delivery Slices

1. Add top-of-report `TL;DR / What To Do Next`
2. Improve action framing and ownership labels
3. Tighten win-filtering and main table row selection
4. Add KPI visuals
5. Compress main-table layout for client mode
6. Polish business-owner narrative language

## Follow-On Work

After this spec is complete and stable, the next logical follow-on project is delivery automation:

- scheduled generation
- saved report history
- email/send workflow
- published npm release and VPS switchback to the public package
