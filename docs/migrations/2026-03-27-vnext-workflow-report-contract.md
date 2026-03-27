# Migration: Workflow Report Contract

- Date: 2026-03-27
- Version target: vNext
- Change type: non-breaking
- Affected tools: `run_seo_audit_workflow`

## Summary

`run_seo_audit_workflow` now returns a shared `report` object and accepts additive report controls for `reportFormat`, `reportPack`, `detailMode`, and optional brand metadata. Existing top-level workflow fields remain in place, and the legacy `markdown` flag still works as an alias when `reportFormat` is omitted.

## Before

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-workflow-before",
  "mode": "full",
  "profile": "technical",
  "siteUrl": "sc-domain:example.com",
  "dateRange": {
    "startDate": "2026-03-01",
    "endDate": "2026-03-27"
  },
  "executiveSummary": {
    "overallStatus": "healthy",
    "stepsSucceeded": 3,
    "stepsFailed": 0,
    "keyActions": []
  },
  "sections": {
    "drilldown": []
  },
  "steps": [],
  "markdownReport": "# SEO Audit Workflow"
}
```

## After

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-workflow-after",
  "mode": "full",
  "profile": "technical",
  "siteUrl": "sc-domain:example.com",
  "reportFormat": "markdown",
  "reportPack": "technical_audit",
  "detailMode": "client",
  "brand": {
    "name": "Nth Agency",
    "accentColor": "#0F172A"
  },
  "dateRange": {
    "startDate": "2026-03-01",
    "endDate": "2026-03-27"
  },
  "executiveSummary": {
    "overallStatus": "healthy",
    "stepsSucceeded": 3,
    "stepsFailed": 0,
    "keyActions": []
  },
  "report": {
    "meta": {
      "title": "Technical SEO Workflow Report",
      "format": "markdown",
      "detailMode": "client",
      "reportPack": "technical_audit",
      "brand": {
        "name": "Nth Agency",
        "accentColor": "#0F172A"
      }
    },
    "site": {
      "siteUrl": "sc-domain:example.com",
      "profile": "technical",
      "dateRange": {
        "startDate": "2026-03-01",
        "endDate": "2026-03-27"
      }
    },
    "executiveSummary": {
      "overallStatus": "healthy",
      "stepsSucceeded": 3,
      "stepsFailed": 0,
      "keyActions": []
    },
    "sections": {
      "drilldown": []
    }
  },
  "sections": {
    "drilldown": []
  },
  "steps": [],
  "markdownReport": "# Technical SEO Workflow Report"
}
```

## Action Required For Agents

No action required. Existing callers can continue using top-level workflow fields and the `markdown` flag. Callers that want a stable handoff object can start consuming the additive `report` payload and new report control inputs.
