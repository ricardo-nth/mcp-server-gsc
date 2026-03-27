# Migration: Monthly SEO Client Report

- Date: 2026-03-27
- Version target: vNext
- Change type: non-breaking
- Affected tools: `run_seo_audit_workflow`

## Summary

`run_seo_audit_workflow` now renders `reportPack: "monthly_seo"` as a client-facing SEO report instead of a generic workflow handoff. The additive `report.sections.monthlySeo` object includes month-over-month KPI summaries, visibility wins, popular searches, top pages, brand vs non-brand performance, next-month priorities, and an analyst appendix. Existing top-level workflow fields remain unchanged.

## Before

```json
{
  "reportPack": "monthly_seo",
  "report": {
    "pack": {
      "headline": "Monthly SEO update pack"
    },
    "sections": {
      "drilldown": []
    }
  },
  "markdownReport": "# Monthly SEO Workflow Report\n\n## Actions\n",
  "htmlReport": "<section><h2>Prioritized Actions</h2></section>"
}
```

## After

```json
{
  "reportPack": "monthly_seo",
  "report": {
    "pack": {
      "headline": "Monthly SEO update pack"
    },
    "sections": {
      "drilldown": [],
      "monthlySeo": {
        "kpiSummary": [],
        "narrative": [],
        "visibilityWins": {
          "queries": [],
          "pages": []
        },
        "popularSearches": {
          "topQueries": [],
          "risingQueries": []
        },
        "topPages": {
          "topPages": [],
          "improvingPages": []
        },
        "brandPerformance": [],
        "nextMonthPriorities": [],
        "analystAppendix": {
          "clientSummary": [],
          "steps": []
        }
      }
    }
  },
  "markdownReport": "# Monthly SEO Workflow Report\n\n## KPI Summary\n",
  "htmlReport": "<section><h2>KPI Summary</h2></section>"
}
```

## Action Required For Agents

No action required. Existing callers can continue consuming the top-level workflow fields. Callers that prepare client deliverables can start reading the additive `report.sections.monthlySeo` object or rely on the richer `markdownReport` / `htmlReport` output when `reportPack` is `monthly_seo`.
