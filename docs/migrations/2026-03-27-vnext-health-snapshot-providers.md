# Migration: Health Snapshot Provider Registry

- Date: 2026-03-27
- Version target: vNext
- Change type: non-breaking
- Affected tools: `health_snapshot`

## Summary

`health_snapshot` now includes additive `providers` diagnostics so operators can see which external SEO data providers are registered, which capabilities they advertise, and how many are configured.

## Before

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-health-before",
  "mode": "full",
  "summary": {
    "status": "ok",
    "runtimeHealthy": true
  }
}
```

## After

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-health-after",
  "mode": "full",
  "providers": {
    "totalProviders": 1,
    "configuredProviders": 0,
    "capabilities": {
      "backlinks": [
        "ahrefs"
      ],
      "keywordDifficulty": [
        "ahrefs"
      ],
      "competitorOverlap": [
        "ahrefs"
      ],
      "trafficEstimate": [
        "ahrefs"
      ]
    },
    "providers": [
      {
        "id": "ahrefs",
        "name": "Ahrefs",
        "mode": "scaffold",
        "configured": false,
        "capabilities": [
          "backlinks",
          "keywordDifficulty",
          "competitorOverlap",
          "trafficEstimate"
        ]
      }
    ]
  }
}
```

## Action Required For Agents

No action required. Existing callers can ignore `providers`. Operational callers can optionally surface the provider registry diagnostics in setup checks.
