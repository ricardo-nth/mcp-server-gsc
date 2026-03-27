# Migration: Workflow HTML Report Output

- Date: 2026-03-27
- Version target: vNext
- Change type: non-breaking
- Affected tools: `run_seo_audit_workflow`

## Summary

`run_seo_audit_workflow` now supports `reportFormat: "html" | "all"` and can return an additive `htmlReport` string for branded, print-ready workflow handoff. Existing JSON payload fields and markdown behavior remain unchanged.

## Before

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-workflow-html-before",
  "mode": "full",
  "reportFormat": "markdown",
  "report": {
    "meta": {
      "title": "Technical SEO Workflow Report",
      "format": "markdown"
    }
  },
  "markdownReport": "# Technical SEO Workflow Report"
}
```

## After

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-workflow-html-after",
  "mode": "full",
  "reportFormat": "all",
  "report": {
    "meta": {
      "title": "Technical SEO Workflow Report",
      "format": "all",
      "brand": {
        "name": "Nth Agency",
        "accentColor": "#0F172A"
      }
    }
  },
  "markdownReport": "# Technical SEO Workflow Report",
  "htmlReport": "<!DOCTYPE html>..."
}
```

## Action Required For Agents

No action required. Existing callers can ignore `htmlReport`. Callers that prepare client deliverables can request `reportFormat: \"html\"` or `reportFormat: \"all\"` and consume the additive HTML output.
