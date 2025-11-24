import re

with open('src-ui/src/App.tsx', 'r') as f:
    content = f.read()

# Count before
before_count = content.count('updateSession(')
print(f"Before: {before_count} updateSession calls")

# Pattern 1: Simple input clears -> updateChat
content = re.sub(
    r"updateSession\((\w+), \(current\) => \(\{\s*\.\.\.current,\s*input: '',\s*\}\)\);",
    r"updateChat(\1, { input: '' });",
    content,
    flags=re.MULTILINE
)

# Pattern 2: Input with value -> updateChat  
content = re.sub(
    r"updateSession\((\w+), \(current\) => \(\{ \.\.\.current, input: ([^}]+) \}\)\);",
    r"updateChat(\1, { input: \2 });",
    content
)

# Pattern 3: hasUnread false -> updateChat
content = re.sub(
    r"updateSession\((\w+), \(current\) => \(\{\s*\.\.\.current,\s*hasUnread: false,?\s*\}\)\);",
    r"updateChat(\1, { hasUnread: false });",
    content,
    flags=re.MULTILINE
)

# Count after
after_count = content.count('updateSession(')
print(f"After: {after_count} updateSession calls")
print(f"Replaced: {before_count - after_count}")

with open('src-ui/src/App.tsx', 'w') as f:
    f.write(content)
