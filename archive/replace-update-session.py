#!/usr/bin/env python3
import re

# Read the file
with open('src-ui/src/App.tsx', 'r') as f:
    content = f.read()

# Pattern 1: Simple input updates -> updateChat
content = re.sub(
    r'updateSession\((\w+), \(current\) => \(\{\s*\.\.\.current,\s*input: ([^,}]+),?\s*\}\)\);',
    r'updateChat(\1, { input: \2 });',
    content
)

# Pattern 2: hasUnread: false -> updateChat
content = re.sub(
    r'updateSession\((\w+), \(current\) => \(\{\s*\.\.\.current,\s*hasUnread: false,?\s*\}\)\);',
    r'updateChat(\1, { hasUnread: false });',
    content
)

# Pattern 3: Attachments updates -> updateChat
content = re.sub(
    r'updateSession\((\w+), \(current\) => \(\{\s*\.\.\.current,\s*attachments: ([^}]+)\}\)\);',
    r'updateChat(\1, { attachments: \2});',
    content
)

# Pattern 4: Remove message updates (comment them out)
content = re.sub(
    r'(updateSession\([^)]+\) => \(\{[^}]*messages:[^}]+\}\)\);)',
    r'// REMOVED: \1 // Messages come from ConversationsContext',
    content
)

# Pattern 5: Remove status updates (comment them out)
content = re.sub(
    r'(updateSession\([^)]+\) => \(\{[^}]*status:[^}]+\}\)\);)',
    r'// REMOVED: \1 // Status comes from ConversationsContext',
    content
)

# Write back
with open('src-ui/src/App.tsx', 'w') as f:
    f.write(content)

print("Replacements complete!")
