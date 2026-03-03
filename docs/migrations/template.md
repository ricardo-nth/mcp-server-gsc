# Migration: <title>

- Date: YYYY-MM-DD
- Version: vX.Y.Z
- Change type: breaking | non-breaking
- Affected tools: `<tool_name_1>`, `<tool_name_2>`

## Summary

Describe what changed and why.

## Before

```json
{
  "requestId": "req-old",
  "rows": []
}
```

## After

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "req-new",
  "mode": "full",
  "summary": {
    "whatChanged": "<tool> completed successfully.",
    "whyItMatters": "Agents can consume stable envelopes.",
    "suggestedNextTool": "<next-tool>"
  },
  "rows": []
}
```

## Action Required For Agents

List exact caller changes needed.
