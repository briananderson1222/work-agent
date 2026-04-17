#!/usr/bin/env bash
# detect-project.sh — Detect project identity from git context
# Outputs: PROJECT_ID (12-char hash), PROJECT_NAME (repo basename)
set -euo pipefail

SOUL_PATH="${SOUL_PATH:-$HOME/.soul}"
INSTINCTS_DIR="$SOUL_PATH/knowledge/instincts"
PROJECTS_FILE="$INSTINCTS_DIR/projects.json"

# Priority 1: explicit env var
if [[ -n "${SOUL_PROJECT_DIR:-}" ]]; then
  cd "$SOUL_PROJECT_DIR"
fi

# Get git remote URL
git_remote=$(git remote get-url origin 2>/dev/null || echo "")

if [[ -n "$git_remote" ]]; then
  # Priority 2: hash of git remote URL (portable)
  PROJECT_ID=$(echo -n "$git_remote" | shasum -a 256 | cut -c1-12)
  PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || basename "$git_remote" .git)
else
  git_root=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
  if [[ -n "$git_root" ]]; then
    # Priority 3: hash of git root path (machine-specific)
    PROJECT_ID=$(echo -n "$git_root" | shasum -a 256 | cut -c1-12)
    PROJECT_NAME=$(basename "$git_root")
  else
    # Priority 4: global fallback
    PROJECT_ID="global"
    PROJECT_NAME="global"
  fi
fi

# Ensure project directory exists
if [[ "$PROJECT_ID" != "global" ]]; then
  proj_dir="$INSTINCTS_DIR/projects/$PROJECT_ID"
  mkdir -p "$proj_dir/instincts"

  # Write project metadata
  cat > "$proj_dir/project.json" <<EOF
{
  "id": "$PROJECT_ID",
  "name": "$PROJECT_NAME",
  "remote": "$git_remote",
  "path": "$(git rev-parse --show-toplevel 2>/dev/null || pwd)",
  "created": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

  # Update projects registry
  mkdir -p "$INSTINCTS_DIR"
  if [[ ! -f "$PROJECTS_FILE" ]]; then
    echo '{}' > "$PROJECTS_FILE"
  fi

  python3 -c "
import json
with open('$PROJECTS_FILE') as f:
    data = json.load(f)
data['$PROJECT_ID'] = {
    'name': '$PROJECT_NAME',
    'remote': '$git_remote',
    'path': '$(git rev-parse --show-toplevel 2>/dev/null || pwd)',
    'last_seen': '$(date -u +%Y-%m-%dT%H:%M:%SZ)'
}
with open('$PROJECTS_FILE', 'w') as f:
    json.dump(data, f, indent=2)
"
fi

export PROJECT_ID
export PROJECT_NAME
echo "PROJECT_ID=$PROJECT_ID"
echo "PROJECT_NAME=$PROJECT_NAME"
