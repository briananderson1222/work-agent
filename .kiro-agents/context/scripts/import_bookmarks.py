#!/usr/bin/env python3
"""
Import browser bookmarks (HTML) into the memory system's bookmarks.md

Usage: python3 import_bookmarks.py <bookmarks.html> <bookmarks.md>

- Parses Netscape bookmark HTML (Chrome/Firefox export)
- Filters out routine tools (email, calendar, people profiles)
- Non-destructive: preserves existing entries
- Detects title changes and prompts for update
- Tags entries based on URL patterns and folder structure
"""
import re
import sys
from pathlib import Path
from datetime import date
from html.parser import HTMLParser


# URLs matching these patterns are skipped (routine tools)
SKIP_PATTERNS = [
    r'mail\.google\.com',
    r'outlook\.(office|live)\.com',
    r'calendar\.google\.com',
    r'linkedin\.com/in/',
    r'phonetool\.',
    r'chime\.aws/',
    r'quip-amazon\.com',
    r'slack\.com/archives',
    r'zoom\.us/j/',
    r'teams\.microsoft\.com',
    r'amazon\.okta\.com',
]

# Folder/URL patterns → tag mapping
TAG_RULES = [
    # URL-based
    (r'github\.com|gitlab\.com|codecommit|code\.amazon', 'repo'),
    (r'docs\.|documentation|/docs/|readme|userguide|developer-guide', 'docs'),
    (r'wiki\.|/wiki/|confluence|runbook', 'wiki'),
    (r'dashboard|console\.|portal|admin\.|grafana|cloudwatch', 'tool'),
    (r'learn\.|training\.|course|certification|workshop|tutorial', 'training'),
    (r'template|boilerplate|starter|scaffold', 'template'),
    (r'spec\.|standard|architecture|rfc|design-doc', 'reference'),
]

# Folder name → tag mapping
FOLDER_TAG_MAP = {
    'documentation': 'docs', 'docs': 'docs', 'guides': 'docs', 'references': 'docs',
    'tools': 'tool', 'dashboards': 'tool', 'portals': 'tool', 'utilities': 'tool',
    'wikis': 'wiki', 'knowledge base': 'wiki', 'runbooks': 'wiki',
    'repos': 'repo', 'repositories': 'repo', 'code': 'repo', 'github': 'repo',
    'training': 'training', 'learning': 'training', 'courses': 'training',
    'templates': 'template',
    'specs': 'reference', 'standards': 'reference', 'architecture': 'reference',
}


class BookmarkParser(HTMLParser):
    """Parse Netscape bookmark HTML format."""

    def __init__(self):
        super().__init__()
        self.bookmarks = []
        self.folders = []  # stack of folder names
        self._current_url = None
        self._current_title_parts = []
        self._in_a = False
        self._in_h3 = False
        self._h3_parts = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == 'a' and 'href' in attrs_dict:
            self._current_url = attrs_dict['href']
            self._current_title_parts = []
            self._in_a = True
        elif tag == 'h3':
            self._in_h3 = True
            self._h3_parts = []
        elif tag == 'dl':
            pass  # folder nesting handled by h3/dl pairs

    def handle_endtag(self, tag):
        if tag == 'a' and self._in_a:
            self._in_a = False
            title = ''.join(self._current_title_parts).strip()
            if self._current_url and title:
                self.bookmarks.append({
                    'title': title,
                    'url': self._current_url,
                    'folders': list(self.folders),
                })
            self._current_url = None
        elif tag == 'h3' and self._in_h3:
            self._in_h3 = False
            folder_name = ''.join(self._h3_parts).strip()
            self.folders.append(folder_name)
        elif tag == 'dl' and self.folders:
            self.folders.pop()

    def handle_data(self, data):
        if self._in_a:
            self._current_title_parts.append(data)
        elif self._in_h3:
            self._h3_parts.append(data)


def should_skip(url):
    """Check if URL matches routine tool patterns."""
    for pattern in SKIP_PATTERNS:
        if re.search(pattern, url, re.IGNORECASE):
            return True
    return False


def infer_tag(url, folders):
    """Infer a tag from URL patterns and folder names."""
    # Check folder names first
    for folder in reversed(folders):
        key = folder.lower().strip()
        if key in FOLDER_TAG_MAP:
            return FOLDER_TAG_MAP[key]

    # Check URL patterns
    for pattern, tag in TAG_RULES:
        if re.search(pattern, url, re.IGNORECASE):
            return tag

    return 'external'


def parse_existing(filepath):
    """Parse existing bookmarks.md entries. Returns dict of url -> line."""
    existing = {}
    if not filepath.exists():
        return existing

    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if not line.startswith('- **'):
                continue
            # Extract URL from: - **DATE** [tag]: Title — URL — Description
            match = re.search(r'—\s+(https?://\S+)', line)
            if match:
                existing[match.group(1)] = line
    return existing


def extract_title_from_line(line):
    """Extract title from an existing bookmark line."""
    # Format: - **DATE** [tag]: Title — URL — Description
    match = re.match(r'- \*\*[\d-]+\*\* \[\w+\]: (.+?) —', line)
    return match.group(1) if match else None


def format_entry(title, url, tag, description='(imported from browser)'):
    """Format a bookmark entry."""
    today = date.today().isoformat()
    return f'- **{today}** [{tag}]: {title} — {url} — {description}'


def main():
    if len(sys.argv) < 3:
        print('Usage: python3 import_bookmarks.py <bookmarks.html> <bookmarks.md>')
        print('  bookmarks.html  — Chrome/Firefox bookmark export')
        print('  bookmarks.md    — Target bookmarks file in memory system')
        return 1

    html_path = Path(sys.argv[1])
    md_path = Path(sys.argv[2])

    if not html_path.exists():
        print(f'Error: {html_path} not found')
        return 1

    # Parse HTML bookmarks
    with open(html_path, 'r', encoding='utf-8', errors='replace') as f:
        html_content = f.read()

    parser = BookmarkParser()
    parser.feed(html_content)
    total_found = len(parser.bookmarks)
    print(f'Found {total_found} bookmarks in HTML')

    # Parse existing entries
    existing = parse_existing(md_path)
    print(f'Found {len(existing)} existing entries in bookmarks.md')

    # Filter and process
    skipped = 0
    preserved = 0
    title_changes = []
    new_entries = []

    for bm in parser.bookmarks:
        url = bm['url']

        # Skip non-http URLs
        if not url.startswith(('http://', 'https://')):
            skipped += 1
            continue

        # Skip routine tools
        if should_skip(url):
            skipped += 1
            continue

        # Check if already exists
        if url in existing:
            preserved += 1
            # Check for title change
            old_title = extract_title_from_line(existing[url])
            if old_title and old_title != bm['title']:
                title_changes.append({
                    'url': url,
                    'old_title': old_title,
                    'new_title': bm['title'],
                    'line': existing[url],
                })
            continue

        # New entry
        tag = infer_tag(url, bm['folders'])
        entry = format_entry(bm['title'], url, tag)
        new_entries.append(entry)

    extracted = preserved + len(new_entries)
    print(f'\nExtracted {extracted} links (skipped {skipped} routine tools)')

    # Handle title changes
    updated = 0
    update_all = False
    skip_all = False

    if title_changes and sys.stdin.isatty():
        for tc in title_changes:
            if skip_all:
                break
            if not update_all:
                print(f"\n⚠️  Title change detected:")
                print(f"   URL: {tc['url']}")
                print(f"   Current: {tc['old_title']}")
                print(f"   New:     {tc['new_title']}")
                choice = input("   Update title? [y/N/a=all/s=skip all]: ").strip().lower()
                if choice == 's':
                    skip_all = True
                    continue
                elif choice == 'a':
                    update_all = True
                elif choice != 'y':
                    continue

            # Update the title in the existing line
            old_line = tc['line']
            new_line = old_line.replace(tc['old_title'], tc['new_title'], 1)
            existing[tc['url']] = new_line
            updated += 1
    elif title_changes:
        print(f'\n⚠️  {len(title_changes)} title changes detected (non-interactive, skipping)')

    # Write output
    md_path.parent.mkdir(parents=True, exist_ok=True)

    # Rebuild file: existing (possibly updated) + new entries
    lines = []

    if md_path.exists():
        with open(md_path, 'r') as f:
            for line in f:
                stripped = line.strip()
                # Check if this line has a URL that was updated
                match = re.search(r'—\s+(https?://\S+)', stripped)
                if match and match.group(1) in existing:
                    lines.append(existing[match.group(1)])
                else:
                    lines.append(line.rstrip())
    else:
        lines.append('# Bookmarks')
        lines.append('')

    # Append new entries
    if new_entries:
        if lines and lines[-1] != '':
            lines.append('')
        for entry in sorted(new_entries):
            lines.append(entry)

    with open(md_path, 'w') as f:
        f.write('\n'.join(lines) + '\n')

    # Summary
    print(f'\n✅ Done! Bookmarks updated.')
    print(f'   - {preserved} existing links preserved')
    if updated:
        print(f'   - {updated} links updated (title changes)')
    print(f'   - {len(new_entries)} new links added')
    print(f'   - {preserved + len(new_entries)} total links')

    return 0


if __name__ == '__main__':
    exit(main())
