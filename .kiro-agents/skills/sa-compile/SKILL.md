---
name: sa-compile
description: Refresh entity hubs on demand and generate summary layers when enough ungrouped notes accumulate.
---

# Hub Compiler

Spec authority: `KNOWLEDGE_SYSTEM.md §4` — Hub Lifecycle (incremental updates, compilation, summary layers). Summary artifact schema: `KNOWLEDGE_SYSTEM.md §1`. Hub pattern: `FILING_GUIDE.md §2`.

## Inputs

| Parameter | Required | Description |
|-----------|----------|-------------|
| `entity_path` | Yes | Path to the entity folder (e.g., `$SOUL_PATH/knowledge/sales/notes/gf-c-08/ufp-industries`) |
| `mode` | No | `compile` (default) or `summary`. `compile` runs hub refresh + summary detection. `summary` forces summary generation for a specific period. |
| `period` | No | Required when `mode=summary`. Format: `YYYY-MM` or `YYYY-QN` (e.g., `2026-03` or `2026-Q1`). |

## Workflow

### Step 1 — Inventory Notes

Walk the entity folder recursively. Collect all `.md` files, excluding:
- `_hub-*.md` (the hub itself)
- Files in `_assets/`, `_converted/`, `raw/` subdirectories
- Files with `type: summary` in frontmatter (already compressed)

For each note, extract: `path`, `date` (from frontmatter or filename prefix), `type`, `initiative` (if present), subfolder (workstream).

### Step 2 — Read Current Hub

Look for `_hub-<entity>.md` in the entity folder root.

- **Hub found:** Read it. Parse frontmatter (`initiatives`, `account`, `territory`, `tags`) and identify human-curated sections (any section with content the agent didn't generate — treat all existing sections as curated unless they are empty link lists).
- **No hub found:** Set `hub_exists: false`. Proceed to Step 5 to auto-generate.

### Step 3 — Hub Refresh (compile mode)

Regenerate the hub content. Preserve human-curated structure — enhance, don't overwrite.

#### 3a — Dead Link Removal

For every wikilink in the hub, verify the target file exists. Remove links whose targets are missing. Add to `dead_links_removed`.

#### 3b — Missing Link Addition

For every note collected in Step 1 that is not already linked from the hub, add a link to the appropriate section:
- Notes in `meetings/` → append to a `## Recent Meetings` section (create if absent)
- Notes in a named workstream subfolder → append to that workstream's section (create if absent)
- Notes in `account-planning/` → append to `## Account Planning` section (create if absent)
- Notes at entity root → append to `## Notes` section (create if absent)

Link format: `[[<relative-path-from-knowledge-root>|YYYY-MM-DD Description]]`

#### 3c — Workstream Graduation

For each subfolder under the entity (excluding `meetings/`, `account-planning/`, `_assets/`, `_converted/`, `raw/`):
- Count `.md` files in the subfolder
- If count ≥ 3 and no dedicated section exists in the hub, create a `## <Workstream Name>` section and move its individual links there
- Add to `workstreams_graduated`

#### 3d — Reorder Sections

Within each section, sort links by date descending (most recent first). Do not reorder sections themselves — preserve the human-defined section order.

### Step 4 — Summary Layer Detection

After hub refresh (or independently when `mode=summary`), check for summary opportunities.

**Threshold:** 5+ ungrouped notes (not already covered by a `type: summary` artifact) with dates falling in the same calendar month.

For each month meeting the threshold:

1. Collect the qualifying notes for that month.
2. Generate a summary artifact at `<entity_path>/summaries/<YYYY-MM>-summary.md` with this frontmatter schema (per KNOWLEDGE_SYSTEM.md §1):

```yaml
---
type: summary
date: <first-note-date-in-period>
last_updated: <today>
scope: "<entity name>"
period: "<YYYY-MM>"
sources:
  - <relative-path-to-note-1>
  - <relative-path-to-note-2>
tags: ["summary", "<entity-slug>"]
---
```

Body: A narrative summary of the period's activity — key themes, decisions, outcomes, open items. Cite each claim with a wikilink to its source note.

3. In the hub, replace the individual note links for that month with a single summary link:
   ```
   [[<entity>/summaries/<YYYY-MM>-summary|<Month YYYY> Summary (<N> notes)]]
   ```
4. Add to `summaries_generated`.

5. Call `@sa-post-write note_path=<summary_path>` for each generated summary.

### Step 5 — Auto-Generate Hub (new entities)

When `hub_exists: false`:

1. Create `_hub-<entity-slug>.md` with frontmatter derived from the entity folder name and any notes found:
   ```yaml
   ---
   account: "<entity-slug>"
   type: hub
   tags: ["hub", "<entity-slug>"]
   ---
   ```
2. Populate sections from the notes inventory (Step 1): Key Contacts (if people wikilinks found in notes), Account Planning, Recent Meetings, workstream sections.
3. Add to `hub_created: true`.

## Output

```json
{
  "hub_path": "path/to/_hub-entity.md",
  "hub_created": false,
  "notes_inventoried": 14,
  "dead_links_removed": ["path/to/missing-note"],
  "links_added": ["path/to/new-note"],
  "workstreams_graduated": ["reverse-tours"],
  "summaries_generated": ["path/to/summaries/2026-03-summary.md"],
  "post_write_triggered": ["path/to/summaries/2026-03-summary.md"],
  "warnings": []
}
```

## Rules

- **Preserve human-curated structure.** Never remove or reorder existing hub sections. Only append and enhance.
- **Dead link removal is the only destructive operation.** All other changes are additive.
- **Summary artifacts are recompilable.** They are point-in-time snapshots — regenerating them is safe.
- **Never summarize notes already covered by a summary.** Check `type: summary` in frontmatter before counting toward the threshold.
- **Always call sa-post-write on generated summaries.** This ensures hub reachability, wikilink resolution, and index rebuild.
- **Workstream graduation threshold is 3+ files** (FILING_GUIDE.md §3). Do not graduate subfolders with fewer files.
- **Summary threshold is 5+ ungrouped notes in a calendar month** (KNOWLEDGE_SYSTEM.md §4).
- **Do not modify note narrative or body content** — only hub files and generated summary artifacts.
