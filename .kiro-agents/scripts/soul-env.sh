#!/bin/bash
# Spawn hook: resolve SOUL_PATH and seed knowledge templates if needed.
TEMPLATES="${1:-}"
RESOLVED="${SOUL_PATH:-$HOME/.kiro-agents/soul}"
RESOLVED="${RESOLVED/#\~/$HOME}"

if [ -n "$TEMPLATES" ] && [ -d "$TEMPLATES/core" ]; then
  if [ ! -d "$RESOLVED/core" ]; then
    mkdir -p "$RESOLVED/core"
    cp "$TEMPLATES"/core/*.md "$RESOLVED/core/" 2>/dev/null
    echo "🆕 Seeded $RESOLVED/core from templates"
  fi
fi

if [ -n "$TEMPLATES" ] && [ -d "$TEMPLATES" ]; then
  for src in "$TEMPLATES"/knowledge/*/; do
    [ -d "$src" ] || continue
    domain=$(basename "$src")
    dest="$RESOLVED/knowledge/$domain"
    if [ ! -d "$dest" ]; then
      mkdir -p "$dest"
      cp "$src"*.md "$dest/" 2>/dev/null
      echo "🆕 Seeded $dest from templates"
    fi
  done
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/detect-project.sh" ]; then
  eval "$("$SCRIPT_DIR/detect-project.sh" 2>/dev/null)" || true
  if [ -n "${PROJECT_ID:-}" ]; then
    export SOUL_PROJECT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
    export SOUL_PROJECT_ID="$PROJECT_ID"
    export SOUL_PROJECT_NAME="${PROJECT_NAME:-unknown}"
  fi
fi

echo ""
echo "📍 SOUL_PATH=$RESOLVED"
echo "   All knowledge reads/writes target this path."
