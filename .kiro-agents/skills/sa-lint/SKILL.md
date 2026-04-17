---
name: sa-lint
description: On-demand or scheduled knowledge base health check. Runs structural
  checks (orphaned notes, broken wikilinks, missing frontmatter, duplicate people),
  quality checks (unlinked mentions, stale syntheses, dense notes), and computes
  engagement signals per entity. Outputs _lint-report.html and _lint-signals.json.
---

# Knowledge Base Health Check

Spec authority: `KNOWLEDGE_SYSTEM.md §5`. Structural rules: `FILING_GUIDE.md`.

## Inputs

| Parameter | Required | Description |
|-----------|----------|-------------|
| `soul_path` | Yes | Absolute path to the soul knowledge base root |
| `domain` | No | Scope checks to a single domain (e.g., `sales`). Default: all domains |
| `mode` | No | `structural`, `quality`, or `full` (default: `full`) |

## Workflow

### Step 1 — Structural Checks

Deterministic file system operations. No LLM.

**Orphaned notes** (severity: medium, auto-fixable):
- `find $SOUL_PATH/knowledge -name "*.md" ! -name "_*"` to list all content notes
- Grep each note path against `_graph.json` edges; flag any with no inbound edges
- Auto-fix: link from nearest hub if entity is determinable

**Broken wikilinks** (severity: high, not auto-fixable):
- Grep all `\[\[...\]\]` patterns across notes
- Resolve each target against the file system; flag missing targets

**Missing required frontmatter** (severity: medium, partially auto-fixable):
- Grep for `^---` blocks; check each for `date:`, `type:`, `tags:` fields
- Auto-fix `date` from filename prefix if `YYYY-MM-DD-*` pattern present; flag others

**Frontmatter schema violations** (severity: low, not auto-fixable):
- Check `type:` values against known enum: `meeting`, `plan`, `synthesis`, `summary`, `person`, `hub`
- Flag any value outside the enum

**Duplicate people cards** (severity: high, not auto-fixable):
- List `$SOUL_PATH/knowledge/sales/people/*.md` basenames
- Fuzzy-compare basenames for near-duplicates; flag pairs for merge

**Empty or near-empty hubs** (severity: low, flag for compilation):
- Find all `_hub-*.md` files; check line count < 10
- Flag as candidates for compilation

### Step 2 — Quality Checks

Skip if `mode=structural`. Delegate to `tool-qmd` where noted.

**Unlinked people mentions**:
- Search note bodies for `[A-Z][a-z]+ [A-Z][a-z]+` patterns not wrapped in `[[...]]`
- Cross-reference against known people files; flag matches

**Stale syntheses**:
- Find notes with `type: synthesis`; read `last_updated` and `sources:` frontmatter
- Run `git log --since=<last_updated>` on each source file; flag syntheses with modified sources

**Dense notes**:
- Flag notes > 500 lines as candidates for splitting or summarizing

**Inconsistency and missing cross-links**:
- Delegate to `tool-qmd` with `qmd_deep_search`

### Step 3 — Engagement Signals

Computed from file system. No LLM. Persisted to `$SOUL_PATH/knowledge/_lint-signals.json`.

For each entity folder found under `$SOUL_PATH/knowledge/sales/notes/`:

- `note_count_30d`: count files modified in last 30 days
- `note_count_60d`: count files modified in last 60 days
- `note_count_90d`: count files modified in last 90 days
- `trend`: compare 30d vs prior 30d (days 31–60) → `up` / `flat` / `down`
- `last_touch`: most recent file mtime under entity folder
- `open_action_items`: grep `- [ ]` across entity folder; count unchecked items

### Step 4 — Output

Write `$SOUL_PATH/knowledge/_lint-signals.json`:

```json
{
  "generated": "ISO-date",
  "structural": {
    "orphaned": [],
    "broken_links": [],
    "missing_frontmatter": [],
    "schema_violations": [],
    "duplicate_people": [],
    "empty_hubs": []
  },
  "quality": {
    "unlinked_people": [],
    "stale_syntheses": [],
    "dense_notes": []
  },
  "engagement": {
    "<entity>": {
      "note_count_30d": 0,
      "note_count_60d": 0,
      "note_count_90d": 0,
      "trend": "up|flat|down",
      "last_touch": "YYYY-MM-DD",
      "open_action_items": 0
    }
  }
}
```

Write `$SOUL_PATH/knowledge/_lint-report.html`:
- Findings grouped by severity: HIGH → MEDIUM → LOW
- Engagement table sorted by `last_touch` ascending (dormant first)
- Auto-fixed items noted inline

## Rules

- Structural checks are deterministic — never use LLM for Step 1.
- Quality checks are advisory — findings are surfaced, not enforced.
- Engagement signals are relationship momentum indicators, not quality judgments.
- Skill is non-destructive — never auto-deletes; only auto-links orphans when entity is determinable.

## Integration Contract

Run on demand or schedule via boo job after `soul-sync`:

```
@sa-lint soul_path=<absolute-path>
@sa-lint soul_path=<absolute-path> domain=sales mode=structural
```

Engagement signal output at `$SOUL_PATH/knowledge/_lint-signals.json` is consumed by `sa-daily` and `prep-week`.
