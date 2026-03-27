# Epic: Monthly Client Report Polish

## Summary

Turn the current `monthly_seo` workflow report into a client-grade monthly SEO deliverable that is easy to skim, easy to send, and easy for non-technical business owners to understand.

The reporting engine is already useful. This epic is about presentation quality, storytelling, responsive layout, and clearer next-step framing so the report can be sent as a client-facing deliverable with minimal manual rewriting.

## Why This Matters

- The current report is structurally strong but still reads too much like an analyst export.
- Clients need to understand what changed, why it matters, and what happens next without reading dense tables.
- A polished monthly report increases trust, reduces clarification calls, and makes ongoing SEO work easier to justify.

## Desired Outcome

By the end of this epic, `reportPack: "monthly_seo"` should produce a report that:

- feels client-facing by default
- explains performance movement in plain English
- highlights the next best actions immediately
- avoids analyst-style noise in the main narrative
- works well on desktop, laptop, and print/PDF output

## Scope

- Add a concise `TL;DR / What to do next` block near the top of the report
- Add compact visual KPI trend components
- Improve month-over-month commentary quality
- Improve top queries and top pages presentation
- Reduce horizontal scrolling in the main report tables
- Tighten what qualifies as a “win” for client-facing sections
- Better separate client-safe content from optional analyst detail

## Out Of Scope

- Scheduled cron generation
- Email delivery
- Persistent report history storage
- Full multi-pack redesign beyond `monthly_seo`
- Server-side PDF generation

## Workstreams

1. Narrative and action framing
2. Visual KPI and chart layer
3. Table and layout polish
4. Data selection and ranking heuristics
5. Client-safe language and appendix boundaries

## Acceptance Criteria

- The top of the report answers:
  - what improved
  - what needs attention
  - what happens next
- Main sections can be understood by a non-technical business owner
- Main report tables fit comfortably on common laptop widths without forcing horizontal scrolling for core columns
- Weak rows with zero meaningful engagement do not dominate “wins” sections
- HTML remains print-safe and suitable for PDF export
- Existing additive workflow contract remains backward compatible

## Dependencies

- Existing `monthly_seo` report pack implementation
- Existing report HTML and markdown renderers
- Existing recommendation, segmentation, and workflow summary outputs

## Recommended Delivery Order

1. `TL;DR / Next actions` summary layer
2. KPI visual cards and lightweight charts
3. Better tables and layout compression
4. Better narrative copy and action framing
5. Win-filtering and cleaner row selection

## Rollout Note

Keep the VPS site pointed at the local/internal build during this epic so live testing can continue without waiting on npm publication.
