---
name: "sa-bookmarks-import"
description: "Import browser bookmark HTML into the memory system."
---

# Bookmarks Import

Import browser bookmarks into the memory system's bookmarks knowledge base.

## Memory Integration

- Reads: Browser bookmark export (HTML), existing `bookmarks.md`
- Writes: `/Users/anderbs/.kiro-agents/soul/knowledge/memories/bookmarks.md`
- Scripts: `/Users/anderbs/.kiro-agents/context/scripts/import_bookmarks.py`

## Workflow

1. **Get HTML file path** from user (or instruct how to export):
   - Chrome → Bookmarks → Bookmark Manager → ⋮ → Export bookmarks

2. **Run import script**:
   ```bash
   python3 /Users/anderbs/.kiro-agents/context/scripts/import_bookmarks.py <path-to-bookmarks.html> /Users/anderbs/.kiro-agents/soul/knowledge/memories/bookmarks.md
   ```

3. **What it does**:
   - Parses all bookmarks from Chrome/Firefox HTML export
   - Filters out routine tools (email, calendar, individual people profiles)
   - Non-destructive: preserves existing entries for known URLs
   - Detects title changes: prompts user to update or keep existing
   - Appends new links with minimal metadata using the bookmarks format
   - Tags entries based on URL patterns and folder structure

4. **Search links**: Use the `knowledge` tool to search bookmarks

## Bookmarks Entry Format

New links imported with minimal metadata:

```markdown
- **YYYY-MM-DD** [tag]: Title — https://... — (imported from browser)
```

Existing links are preserved as-is. Only new URLs get appended.

## Tag Mapping

The import script maps bookmark folders and URL patterns to tags:

| Pattern | Tag |
|---------|-----|
| Documentation, docs, guides | `[docs]` |
| Tools, dashboards, portals | `[tool]` |
| Wiki, knowledge base, runbook | `[wiki]` |
| GitHub, GitLab, repos | `[repo]` |
| Training, courses, learn | `[training]` |
| Templates, boilerplate | `[template]` |
| Specs, standards, architecture | `[reference]` |
| Everything else | `[external]` |

## Questions to Ask

- What's the path to your bookmark HTML file?
- If no file provided, explain how to export from Chrome
- For adding single links, suggest using the bookmarks context rules directly instead

## Output Format

```
Found 881 bookmarks in HTML
Found 215 existing entries in bookmarks.md

Extracted 247 links (skipped 634 routine tools)

⚠️  Title change detected:
   URL: https://...
   Current: AWS Workshop
   New:     Bedrock Workshop - Automotive
   Update title? [y/N/a=all/s=skip all]:

✅ Done! Bookmarks updated.
   - 215 existing links preserved
   - 5 links updated (title changes)
   - 32 new links added
   - 247 total links
```

## Tips

- Use for bulk import when you've accumulated many browser bookmarks
- For individual links, just ask the agent to "bookmark this" or "save this link"
- Import is non-destructive — preserves existing entries
- Title changes prompt for user confirmation
- Use `knowledge` tool to search across all bookmarks after import
