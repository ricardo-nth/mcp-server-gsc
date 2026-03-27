# Migration: Workflow Report Packs

- Date: 2026-03-27
- Version target: vNext
- Change type: non-breaking
- Affected tools: `run_seo_audit_workflow`

## Summary

`run_seo_audit_workflow` now applies pack-specific report context for `monthly_seo`, `technical_audit`, `indexing_recovery`, and `content_opportunities`. The response includes an additive `report.pack` object, and invalid `profile` + `reportPack` combinations now fail validation before execution.

## Before

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-workflow-pack-before",
  "mode": "full",
  "profile": "technical",
  "reportPack": "technical_audit",
  "report": {
    "meta": {
      "reportPack": "technical_audit"
    }
  }
}
```

## After

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-workflow-pack-after",
  "mode": "full",
  "profile": "technical",
  "reportPack": "technical_audit",
  "report": {
    "meta": {
      "reportPack": "technical_audit"
    },
    "pack": {
      "name": "technical_audit",
      "headline": "Technical audit pack",
      "summary": "Frames the workflow around indexing, site health, and technical risks so teams can move from diagnosis into fixes quickly.",
      "cadence": "ad_hoc",
      "primaryAudience": "both"
    }
  }
}
```

## Action Required For Agents

No action required for valid calls. If a caller uses `reportPack`, it should now pair the pack with a compatible profile: `technical_audit` -> `technical`, `indexing_recovery` -> `indexing`, and `monthly_seo` / `content_opportunities` -> `content`.
