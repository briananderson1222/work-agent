---
name: "sa-knowledge-backfill"
description: "Seed the sales knowledge base with historical CRM data (accounts, opportunities, activities). Run once to bootstrap, then incrementally."
---

# Backfill SA Insights

Populate the SA insights knowledge base with historical data from the current year.

## Delegation

| Subagent | Purpose |
|----------|---------|
| tool-crm (if available) | Accounts, opportunities, activities for territory |
| tool-notes | Meeting notes and documents for enrichment |

Write results to the `-Sales` knowledge base as pointers (Tier 1) via **sa-capture**.

## Workflow

1. **Confirm scope** - Which accounts to backfill? Options:
   - All my territory accounts
   - Specific account(s)
   - Accounts with activity in last N days
2. **[P] Retrieve my accounts** - Get territory/account team list from CRM
3. **[P] Gather historical data** - For all accounts:
   - Activities from current year
   - Tasks (my tasks) from current year
   - Opportunities (open + closed this year)
   - Insights created this year
   - Meeting notes from notes subagent (if available)
4. **Assess data quality** - Flag accounts with rich vs sparse data
5. **Present summary** - Show accounts with data found, grouped by richness
6. **User selects** - Which accounts to backfill (default: all with data)
7. **Write to knowledge base** - For each selected account (one by one):
   - Delegate to SA insights subagent with explicit write intent
   - Organize data by type:
     - **activities/** - Meeting activities, customer interactions, attendees, discussion summaries
     - **pfrs/** - Product feature requests, customer influence, priority, use cases
     - **insights/** - Leadership insights, business impact, categories
     - **highlights/** - Quarterly highlights, ARR, outcomes, testimonials, technical activities
     - **plans/** - TAPs, strategic priorities, stakeholders, competitive landscape, AI/data strategy
     - **outreach/** - Email outreach history, contact relationships, communication context
   - Include all source links for each entry

## Questions to Ask

1. "Which accounts to backfill?" (default: all my territory)
2. "How far back this year?" (default: Jan 1)
3. "Which accounts to proceed with?" (after showing summary)

## Output Format

```
📊 Backfill Summary - [Year]

Accounts with rich data (3+ sources):
1. [Account] - Activities: X | Tasks: Y | Opportunities: Z | Notes: W

Accounts with some data (1-2 sources):
2. [Account] - Activities: X | Opportunities: Y

Accounts with no data:
- [Account], [Account]

Which accounts to backfill? (numbers, "all", or "rich")
```

## Notes

- Only backfill current year (territory-relevant)
- Research phase gathers all data first
- Write phase goes one account at a time
- Include all CRM links as sources
- Backfill writes primarily as **pointers** (Tier 1) — date, account, summary, source system, identifier, access method for each activity/opportunity/insight. This creates the searchable/aggregatable layer without copying full records.
- For accounts with rich cross-system context (multiple data sources that tell a connected story), also write **curated knowledge** (Tier 2) entries capturing the synthesis — but only for accounts where the connected narrative adds value beyond what individual source systems provide.
- After the initial backfill, ongoing capture should follow the stricter rules in sa-capture (pointers auto-written, curated knowledge requires justification).
- Backfilled entries should be reviewed ~90 days after initial backfill. Pointers are permanent, but curated knowledge entries that haven't been referenced or enriched may need consolidation.

## Post-Write Processing

After writing each account's notes, invoke the universal post-write processor:

```
@sa-post-write note_path=<path-to-the-file-just-written>
```

For bulk backfill, run sa-post-write once per written file. This handles frontmatter validation, people extraction, wikilink resolution, cross-link discovery, reachability verification, and index rebuild.
