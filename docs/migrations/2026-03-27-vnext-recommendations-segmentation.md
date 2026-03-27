# Migration: Recommendation Segmentation

- Date: 2026-03-27
- Version target: vNext
- Change type: non-breaking
- Affected tools: `recommend_next_actions`

## Summary

`recommend_next_actions` now adds branded vs non-branded segmentation and page template grouping to its additive output. Each recommendation also includes `brandSegment` and `pageTemplate`, and callers can optionally pass `brandTerms` to override automatic brand-term derivation.

## Before

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-rec-before",
  "mode": "full",
  "recommendations": [
    {
      "action": "Improve title/meta for query \"crm software\" on https://example.com/crm",
      "impact": "high"
    }
  ]
}
```

## After

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-rec-after",
  "mode": "full",
  "brandTermsUsed": [
    "example"
  ],
  "segmentationSummary": [
    {
      "segment": "non_branded",
      "opportunities": 5,
      "totalClickUpside": 132,
      "totalImpressions": 6800
    }
  ],
  "templateGroups": [
    {
      "template": "blog",
      "opportunities": 3,
      "totalClickUpside": 84,
      "brandedOpportunities": 0,
      "nonBrandedOpportunities": 3
    }
  ],
  "recommendations": [
    {
      "action": "Improve title/meta for query \"crm software\" on https://example.com/crm",
      "impact": "high",
      "brandSegment": "non_branded",
      "pageTemplate": "product"
    }
  ]
}
```

## Action Required For Agents

No action required. Existing callers can ignore the new segmentation fields. Agents that prioritize by brand mix or template type can start consuming `brandTermsUsed`, `segmentationSummary`, `templateGroups`, `brandSegment`, and `pageTemplate`.
