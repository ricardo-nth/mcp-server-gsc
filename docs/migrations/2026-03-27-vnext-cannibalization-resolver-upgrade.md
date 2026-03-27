# Migration: Cannibalization Resolver Upgrade

- Date: 2026-03-27
- Version target: vNext
- Change type: non-breaking
- Affected tools: `cannibalization_resolver`

## Summary

`cannibalization_resolver` now adds branded segmentation, intent/cluster labels, template context, severity, and stronger action metadata to each resolved query. Callers can also provide `brandTerms` to override automatic brand-term derivation.

## Before

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-cannibal-before",
  "mode": "full",
  "queries": [
    {
      "query": "crm pricing",
      "pageCount": 2,
      "recommendation": {
        "winnerUrl": "https://example.com/pricing",
        "actions": [
          {
            "url": "https://example.com/blog/crm-pricing",
            "action": "consolidate"
          }
        ]
      }
    }
  ]
}
```

## After

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-cannibal-after",
  "mode": "full",
  "brandTermsUsed": [
    "example"
  ],
  "segmentationSummary": [
    {
      "segment": "non_branded",
      "queries": 3,
      "totalImpressions": 4200
    }
  ],
  "queries": [
    {
      "query": "crm pricing",
      "intent": "commercial",
      "cluster": "crm-pricing",
      "brandSegment": "non_branded",
      "severity": "high",
      "templates": [
        "blog",
        "product"
      ],
      "recommendation": {
        "winnerUrl": "https://example.com/pricing",
        "winnerTemplate": "product",
        "severity": "high",
        "actions": [
          {
            "url": "https://example.com/blog/crm-pricing",
            "template": "blog",
            "action": "consolidate",
            "owner": "seo_analyst",
            "impact": "high",
            "actionPriority": "now"
          }
        ]
      }
    }
  ]
}
```

## Action Required For Agents

No action required. Existing callers can ignore the new context fields. Agents that automate remediation can now use `severity`, `brandSegment`, `templates`, `owner`, and `actionPriority` to route work more precisely.
