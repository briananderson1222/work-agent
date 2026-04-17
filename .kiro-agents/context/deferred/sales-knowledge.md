# Sales Knowledge Base

<!-- Domain context: Sales activities, account contacts, strategic insights, team feedback, plans, PFRs, outreach, highlights, territory notes, and people -->

You have a sales knowledge base at `/Users/anderbs/.kiro-agents/soul/knowledge/sales/`.
It persists across sessions and contains two types of data:

1. **Pointers** — lightweight pointers (date, account, summary, source, id, access method) written
   automatically after skills create artifacts in destination systems (CRM, SIFT, etc.).
   These make source systems findable and aggregatable without brute-force searching.
2. **Curated knowledge** — richer entries capturing context that doesn't exist in any
   single source system (relationship nuance, cross-system synthesis, user corrections,
   strategic framing). These require justification before saving.

See `soul-protocol.md` for the full two-tier framework.

## What's In It

### Index Files (root of sales/)

| File | Contains |
|------|----------|
| `activities.md` | Pointers for logged CRM activities + curated knowledge about customer interactions |
| `pfrs.md` | Pointers for PFRs/CIs filed + curated knowledge about product gaps |
| `insights.md` | Pointers for SIFT insights created |
| `highlights.md` | Pointers for quarterly highlights + curated knowledge (ARR, outcomes, testimonials) |
| `plans.md` | Pointers for TAPs created + curated knowledge (strategic priorities, competitive landscape) |
| `contacts.md` | People — connection graph, relationship notes, role context |
| `outreach.md` | Pointers for outreach sent + curated knowledge (relationship context) |

### Territory Notes (`sales/notes/`)

Customer and territory notes synced from OneNote and .sa+ archive. Organized by territory, then account.

```
notes/
├── direct-03/                    ← Territory: AUTOMFG_GF_A-03
│   ├── _territory.md             ← Territory overview with account table
│   ├── brose-north-america/      ← Account folder
│   │   ├── _hub.md               ← Map of Content: links all notes, people, CRM data
│   │   ├── account-planning/     ← Account plans, SA plans
│   │   ├── meetings/             ← Dated meeting notes (YYYY-MM-DD-description.md)
│   │   ├── partners/             ← Partner conversations
│   │   └── ...                   ← Workstream folders (ai-week, mig-welding, etc.)
│   ├── oreilly-automotive/
│   ├── benteler-automotive/
│   ├── nidec/
│   └── oneteam-direct-03/
├── gf-c-08/                      ← Territory: AUTOMFG_GF_C-08
│   ├── _territory.md
│   ├── rpm-international/
│   ├── darling-ingredients/
│   ├── mettler-toledo/
│   ├── asahi-kasei-plastics-na/
│   ├── ufp-industries/
│   └── oneteam-automfg02-08/
└── internal/                     ← Non-account notes (personal, cross-territory)
    └── my-notebook/
```

**Hub pages** (`_hub.md`) are the key navigation tool. Each account hub links to all notes, people, CRM data, and SFDC activity logs for that account.

**Naming convention:** Meeting notes use `YYYY-MM-DD-short-description.md` for chronological sorting.

### People (`sales/people/`)

One file per contact (customer, partner, or AWS team member). Each file has:
- `territories` field in frontmatter for filtering by territory
- Wikilinks to account hubs
- Role, company, and relationship notes

People files are shared across territories — a person can belong to multiple territories.

## How to Access

Search the `-Sales` knowledge base using the `knowledge` tool. This is indexed content — do NOT `read` or list files in the sales directory directly. See Knowledge Base Access Rules in `soul.md`.

Example queries:
- "action items for [Customer]"
- "last interaction with [Account]"
- "open PFRs"
- "contacts at [Company]"
- "quarterly highlights"
- "Brose meeting notes"
- "O'Reilly partners"

## When to Write

Use the **sa-capture** skill to write to the sales KB. It handles two modes:

- **Mode 1 (Pointers):** Written automatically after artifact creation. No prompting.
- **Mode 2 (Curated knowledge):** Requires justification. Agent must explain why the entry has future value.

For territory notes, use the Obsidian templates (`templates/meeting-note.md`, `templates/tour-note.md`) and follow the frontmatter conventions (account, type, territory, date, status, tags).

See sa-capture for file routing, entry formatting, confidence assessment, and contact detection.
