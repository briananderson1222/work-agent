#!/bin/bash
# Spawn hook: discover agent cards from ~/.kiro-agents
echo "=== Agent Card Discovery ==="
FOUND=0
for card in ~/.kiro-agents/agent-card.json; do
  [ -f "$card" ] || continue
  FOUND=$((FOUND + 1))
  name=$(python3 -c "import json,sys; d=json.load(open('$card')); print(d.get('name','?'))" 2>/dev/null)
  agent=$(python3 -c "import json,sys; d=json.load(open('$card')); print(d.get('agent','?'))" 2>/dev/null)
  desc=$(python3 -c "import json,sys; d=json.load(open('$card')); print(d.get('description',''))" 2>/dev/null)
  echo ""
  echo "📋 $name (agent: $agent)"
  echo "   $desc"
done
if [ "$FOUND" -eq 0 ]; then
  echo "No agent cards found."
else
  echo ""
  echo "Discovered $FOUND orchestrator(s)."
fi
