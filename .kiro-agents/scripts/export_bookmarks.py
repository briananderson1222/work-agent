#!/usr/bin/env python3
"""
Export bookmarks from the memory system's bookmarks.md to browser-importable HTML.

Usage: python3 export_bookmarks.py <bookmarks.md> [output.html]

Reads the flat bookmark format:
  - **DATE** [tag]: Title — URL — Description

Generates nested HTML folders organized by tag.
"""
import re
import sys
from pathlib import Path
from datetime import datetime
from html import escape


def parse_bookmarks(filepath):
    """Parse bookmarks from the memory system format."""
    with open(filepath, 'r') as f:
        content = f.read()

    links = []
    for line in content.splitlines():
        line = line.strip()
        if not line.startswith('- **'):
            continue

        # Format: - **DATE** [tag]: Title — URL — Description
        match = re.match(
            r'- \*\*[\d-]+\*\* \[(\w+)\]: (.+?) — (https?://\S+)(?: — (.+))?$',
            line
        )
        if match:
            links.append({
                'tag': match.group(1),
                'title': match.group(2),
                'url': match.group(3),
                'description': match.group(4) or '',
            })

    return links


TAG_LABELS = {
    'docs': '📄 Documentation',
    'tool': '🔧 Tools',
    'wiki': '📚 Wikis & Runbooks',
    'repo': '💻 Repositories',
    'training': '🎓 Training & Learning',
    'template': '📋 Templates',
    'reference': '📐 Reference & Standards',
    'external': '🌐 External Resources',
}


def organize_by_tag(links):
    """Organize links by tag."""
    organized = {}
    for link in links:
        tag = link['tag']
        label = TAG_LABELS.get(tag, tag.title())
        if label not in organized:
            organized[label] = []
        organized[label].append(link)

    for label in organized:
        organized[label].sort(key=lambda x: x['title'].lower())

    return organized


def generate_html(organized):
    """Generate Netscape bookmark HTML file."""
    timestamp = int(datetime.now().timestamp())

    html = [
        '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
        '<!-- This is an automatically generated file.',
        '     It will be read and overwritten.',
        '     DO NOT EDIT! -->',
        '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
        '<TITLE>Bookmarks</TITLE>',
        '<H1>Bookmarks</H1>',
        '<DL><p>',
        f'    <DT><H3 ADD_DATE="{timestamp}" LAST_MODIFIED="{timestamp}" '
        f'PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Bar</H3>',
        '    <DL><p>',
    ]

    for label in sorted(organized.keys()):
        links = organized[label]
        html.append(f'        <DT><H3 ADD_DATE="{timestamp}" '
                    f'LAST_MODIFIED="{timestamp}">{escape(label)}</H3>')
        html.append('        <DL><p>')

        for link in links:
            html.append(f'            <DT><A HREF="{escape(link["url"])}" '
                        f'ADD_DATE="{timestamp}">{escape(link["title"])}</A>')

        html.append('        </DL><p>')

    html.append('    </DL><p>')
    html.append('</DL><p>')

    return '\n'.join(html)


def main():
    if len(sys.argv) < 2:
        print('Usage: python3 export_bookmarks.py <bookmarks.md> [output.html]')
        return 1

    bookmarks_file = Path(sys.argv[1])
    output = sys.argv[2] if len(sys.argv) > 2 else str(
        Path.home() / 'Downloads' / 'bookmarks_organized.html'
    )

    if not bookmarks_file.exists():
        print(f'Error: {bookmarks_file} not found')
        return 1

    links = parse_bookmarks(bookmarks_file)
    organized = organize_by_tag(links)
    html = generate_html(organized)

    with open(output, 'w') as f:
        f.write(html)

    print(f'\n✅ Bookmarks exported!')
    print(f'   • Source: {bookmarks_file} ({len(links)} links)')
    print(f'   • Output: {output}')
    print(f'   • Organized into {len(organized)} tag folders')
    print(f'\n📥 Import to browser:')
    print(f'   • Chrome → Bookmarks → Bookmark Manager → ⋮ → Import bookmarks')

    return 0


if __name__ == '__main__':
    exit(main())
