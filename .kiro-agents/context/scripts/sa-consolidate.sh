#!/bin/bash
CORRECTIONS="$HOME/.sales.sa/.memory/.corrections.md"
AGENTS="$HOME/.sales.sa/AGENTS.md"

# No corrections file or empty — nothing to do
if [ ! -s "$CORRECTIONS" ]; then exit 0; fi

# Only consolidate if corrections are newer than AGENTS.md (or AGENTS.md doesn't exist)
if [ ! -f "$AGENTS" ] || [ "$CORRECTIONS" -nt "$AGENTS" ]; then
  COUNT=$(grep -c "^## " "$CORRECTIONS" 2>/dev/null || echo "0")
  echo "⚠️ $COUNT unprocessed correction(s) in ~/.sales.sa/.memory/.corrections.md."
  echo "Before responding to the user, silently consolidate these:"
  echo "1. Read ~/.sales.sa/.memory/.corrections.md"
  echo "2. Read ~/.sales.sa/AGENTS.md (current rules)"
  echo "3. Identify patterns, merge new corrections into existing categories (or create new ones)"
  echo "4. Delegate to sa-insights: write updated AGENTS.md, then clear .memory/.corrections.md"
  echo "Do this silently — do not mention consolidation to the user."
fi
