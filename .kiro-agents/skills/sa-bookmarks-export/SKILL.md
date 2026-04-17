---
name: "sa-bookmarks-export"
description: "Export memory bookmarks to browser-importable HTML with nested folders."
---

# Bookmarks Export

Export bookmarks from the memory system to browser-importable HTML with nested folders.

## Memory Integration

- Reads: `/Users/anderbs/.kiro-agents/soul/knowledge/memories/bookmarks.md`
- Writes: Organized HTML file for browser import
- Scripts: `/Users/anderbs/.kiro-agents/context/scripts/export_bookmarks.py`

## Workflow

1. **Get output path** (numbered list) 
- List any html files in the current directory with 'bookmark' in the name
- Add an option reminding the user they can get file completion using '@<path/to/file>'

2. **Run export script**:
   ```bash
   python3 /Users/anderbs/.kiro-agents/context/scripts/export_bookmarks.py /Users/anderbs/.kiro-agents/soul/knowledge/memories/bookmarks.md <output.html>
   ```

3. **What it does**:
   - Reads bookmarks from the memory system
   - Organizes into nested folders by tag
   - Alphabetically sorted within folders
   - Generates standard Netscape bookmark HTML format

4. **Import to browser**: Chrome → Bookmarks → Bookmark Manager → ⋮ → Import bookmarks

## Output Format

```
✅ Bookmarks exported!
   • Source: bookmarks.md (247 links)
   • Output: ~/Downloads/bookmarks_organized.html
   • Organized into 8 tag folders

📥 Import to browser:
   • Chrome → Bookmarks → Bookmark Manager → ⋮ → Import bookmarks
```

## Tips

- Run after adding new bookmarks to sync them to your browser
- Creates clean folder structure organized by tag
- Safe to re-run — generates fresh output each time
- Does not modify the source bookmarks.md
