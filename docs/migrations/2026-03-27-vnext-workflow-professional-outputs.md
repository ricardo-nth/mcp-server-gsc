# Migration: Workflow Professional Outputs

- Date: 2026-03-27
- Version target: vNext
- Change type: non-breaking
- Affected tools: `run_seo_audit_workflow`

## Summary

`run_seo_audit_workflow` now returns additive professional handoff fields: top-level `issues`, `actions`, `clientSummary`, and optional `analystSummary`, plus mirrored data inside `report`. These outputs include deterministic severity, impact, effort, and owner metadata for downstream workflow execution.

## Before

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-workflow-pro-before",
  "mode": "full",
  "executiveSummary": {
    "overallStatus": "partial",
    "keyActions": [
      "Investigate 3 traffic drop alert(s)"
    ]
  },
  "report": {
    "sections": {
      "drilldown": []
    }
  }
}
```

## After

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-workflow-pro-after",
  "mode": "full",
  "clientSummary": [
    "2 issues require attention in this workflow handoff.",
    "3 prioritized actions were generated for follow-up."
  ],
  "issues": [
    {
      "sourceStep": "indexing_health_report",
      "title": "12 URLs are not indexed",
      "severity": "high",
      "impact": "high",
      "effort": "medium",
      "owner": "seo_engineering",
      "clientSummary": "12 URLs need indexing remediation before they can contribute to organic visibility."
    }
  ],
  "actions": [
    {
      "sourceStep": "recommend_next_actions",
      "action": "Improve title/meta for query \"crm software\" on https://example.com/crm",
      "impact": "high",
      "effort": "low",
      "owner": "content",
      "clientSummary": "Recommended next step: Improve title/meta for query \"crm software\" on https://example.com/crm."
    }
  ],
  "report": {
    "audience": {
      "detailMode": "both",
      "clientSummary": [
        "2 issues require attention in this workflow handoff.",
        "3 prioritized actions were generated for follow-up."
      ],
      "analystSummary": [
        "detect_content_decay failed with: Number must be greater than or equal to 14"
      ]
    },
    "issues": [],
    "actions": []
  }
}
```

## Action Required For Agents

No action required. Existing callers can ignore the new handoff fields. Agents that want clearer execution planning can start consuming `issues`, `actions`, `clientSummary`, and optional `analystSummary` directly.
