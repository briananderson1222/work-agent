---
name: sa-post-write
description: Universal post-write processor. Runs after any note is written to the
  knowledge base — validates frontmatter, extracts and links people, resolves wikilinks,
  discovers cross-links, checks hub reachability, and triggers index rebuild.
---

# Post-Write Processor

Spec authority: `KNOWLEDGE_SYSTEM.md §3`. Linking rules: `FILING_GUIDE.md §14`. Fuzzy name resolution: `FILING_GUIDE.md §14 — Fuzzy name resolution`.

## Inputs

| Parameter | Required | Description |
|-----------|----------|-------------|
| `note_path` | Yes | Absolute or `$SOUL_PATH`-relative path to the note just written |
| `domain` | No | Override domain (e.g., `sales`). Inferred from path if omitted |
| `entity` | No | Override entity name. Inferred from nearest `_hub-*.md` if omitted |

## Workflow

### Step 1 — Frontmatter Validation

Read the note. Check for required fields: `date`, `type`, `tags`.

- If `date` is missing: derive from filename (`YYYY-MM-DD-*` prefix). If filename has no date, use today.
- If `type` or `tags` are missing: add to `warnings` — do not block.
- Domain schemas may require additional fields; flag any that are absent.

### Step 2 — People Extraction

Scan the note body for capitalized name patterns (First Last, First M. Last).

For each candidate name:

1. **Search the entity hub roster first.** Read the nearest `_hub-*.md` and compare the candidate against its people list (FILING_GUIDE.md §14 — use hub as roster before searching broadly).
2. **Fuzzy match against people files** in `$SOUL_PATH/knowledge/sales/people/` (or domain-equivalent path):
   - Same first name + similar last name → **confident match** → add `[[firstname-lastname]]` wikilink inline if not already present.
   - Same last name + similar first name → **confident match** → same action.
   - Ambiguous (e.g., "Mike" with multiple Mikes in hub) → **flag** — leave unlinked, add to `people_flagged`.
3. **No match found** and name looks like a real person (not a company or product):
   - Create stub at `$SOUL_PATH/knowledge/sales/people/firstname-lastname.md` with minimal frontmatter: `type: person`, `date`, `tags: [person]`.
   - Add to `people_created`.
   - **Never silently create duplicates** — if any fuzzy match exists, prefer linking over creating (FILING_GUIDE.md §14 rule 5).

### Step 3 — Wikilink Resolution

For every known entity mentioned in the note (people already handled above):

- **Accounts / hubs:** search for `_hub-*.md` files under the note's domain path. Confident name match → add `[[entity/_hub-entity|Entity Name]]` wikilink if absent.
- Auto-add wikilinks for confident matches only. Ambiguous → flag.

### Step 4 — Cross-Link Discovery

Delegate to `sa-knowledge-search` (or use the `knowledge` tool directly) to find semantically related notes: shared tags, shared people, similar content.

- Suggest up to 3 cross-links.
- **Do NOT auto-insert** into note body — add to `cross_links_suggested` in the output report only.

### Step 5 — Reachability Check

Determine the entity hub for this note:

1. Walk up the directory tree from `note_path` looking for `_hub-*.md`.
2. **Hub found:** check whether the note is already linked from the hub. If not, append a link entry to the hub's appropriate section (Meetings, Workstreams, etc.) using wikilink syntax `[[path/to/note|Display Name]]`. Set `hub_linked: true`.
3. **No hub found:** set `hub_linked: false`, add to `warnings` as orphaned.

### Step 6 — Index Rebuild

Fire-and-forget: invoke `qmd index` via `tool-qmd` (or equivalent MCP call) to re-embed the note. Do not await completion. Set `index_triggered: true` in output.

## Output

```json
{
  "validated": true,
  "warnings": [],
  "people_linked": ["firstname-lastname"],
  "people_created": ["new-person"],
  "people_flagged": ["Mike (ambiguous — Mike Humbert or Mike Robson)"],
  "wikilinks_added": ["entity/_hub-entity"],
  "cross_links_suggested": ["path/to/related-note"],
  "hub_linked": true,
  "hub_path": "path/to/_hub-entity.md",
  "index_triggered": true
}
```

## Domain Extensions

After universal checks complete, check whether a domain-specific post-processor skill exists:

1. Derive `domain` from the note path (e.g., note under `knowledge/sales/` → `sales`).
2. Look for skill `sa-post-write-<domain>` (e.g., `sa-post-write-sales`).
3. If found, invoke it with `note_path=<path>` and pass the universal check output as `universal_check_results`.
4. Domain skills may: map to account/territory, update account hub, extract action items, tag with CRM metadata.
5. Domain skills may NOT: modify note narrative, re-run universal checks, or block the workflow.

See `docs/sa-post-write-domain-extensions.md` for the full extension contract and a skeleton example.

## Rules

- Never modify note narrative or body content — only frontmatter, wikilinks, and hub files.
- Never silently create duplicate people files — fuzzy match first, create only when no match exists.
- Flag ambiguous matches rather than guessing.
- All hub edits are append-only — never remove or reorder existing hub content.
- Processing is non-blocking — warnings and suggestions are reported, not enforced.

## Integration Contract

Any skill that writes a note to the knowledge base should call this skill as its final step:

```
@sa-post-write note_path=<absolute-or-soul-relative-path>
```
