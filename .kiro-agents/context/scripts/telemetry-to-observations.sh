#!/usr/bin/env bash
# telemetry-to-observations.sh — Transform kiro telemetry into project-scoped observations
set -euo pipefail

SOUL_PATH="${SOUL_PATH:-$HOME/.soul}"
TELEMETRY_FILE="${HOME}/.kiro/telemetry/events.jsonl"
INSTINCTS_DIR="$SOUL_PATH/knowledge/instincts"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MAX_SIZE_BYTES=$((10 * 1024 * 1024))  # 10MB
RETENTION_DAYS=30
MAX_FIELD_LEN=5000

# Secret patterns to scrub
SECRET_RE='(api_key|token|secret|password|authorization|credentials|aws_access_key|aws_secret)\s*[=:]\s*["'"'"']*[A-Za-z0-9+/=_-]{8,}'

scrub_secrets() {
  sed -E "s/$SECRET_RE/\1=[REDACTED]/gi"
}

if [[ ! -f "$TELEMETRY_FILE" ]]; then
  echo "No telemetry file at $TELEMETRY_FILE"
  exit 0
fi

# Track last processed position
STATE_FILE="$INSTINCTS_DIR/.telemetry-offset"
mkdir -p "$INSTINCTS_DIR"
last_offset=0
if [[ -f "$STATE_FILE" ]]; then
  last_offset=$(cat "$STATE_FILE")
fi

current_lines=$(wc -l < "$TELEMETRY_FILE" | tr -d ' ')
if [[ "$last_offset" -ge "$current_lines" ]]; then
  echo "No new telemetry events."
  exit 0
fi

# Process new events
tail -n +"$((last_offset + 1))" "$TELEMETRY_FILE" | python3 -c "
import sys, json, os, hashlib, subprocess
from datetime import datetime

instincts_dir = '$INSTINCTS_DIR'
script_dir = '$SCRIPT_DIR'
max_len = $MAX_FIELD_LEN

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        continue

    name = data.get('name', '')
    if name not in ('pre_tool_use', 'post_tool_use'):
        continue

    attrs = data.get('attributes', {})
    agent_name = attrs.get('agent.name', '')
    if agent_name.startswith('tool-'):
        continue

    cwd = attrs.get('cwd', '')
    tool_name = attrs.get('tool.name', '')
    timestamp = data.get('timestamp', datetime.utcnow().isoformat() + 'Z')
    session_id = data.get('context', {}).get('trace_id', '')
    tool_input = str(attrs.get('tool.input', ''))[:max_len]
    tool_output = str(attrs.get('tool.response', ''))[:max_len]

    # Detect project
    project_id = 'global'
    project_name = 'global'
    if cwd and os.path.isdir(cwd):
        try:
            result = subprocess.run(
                ['bash', os.path.join(script_dir, 'detect-project.sh')],
                capture_output=True, text=True, cwd=cwd, timeout=5,
                env={**os.environ, 'SOUL_PATH': os.environ.get('SOUL_PATH', os.path.expanduser('~/.soul'))}
            )
            for out_line in result.stdout.strip().split('\n'):
                if out_line.startswith('PROJECT_ID='):
                    project_id = out_line.split('=', 1)[1]
                elif out_line.startswith('PROJECT_NAME='):
                    project_name = out_line.split('=', 1)[1]
        except Exception:
            pass

    # Determine output path
    if project_id == 'global':
        obs_file = os.path.join(instincts_dir, 'observations.jsonl')
    else:
        obs_dir = os.path.join(instincts_dir, 'projects', project_id)
        os.makedirs(obs_dir, exist_ok=True)
        obs_file = os.path.join(obs_dir, 'observations.jsonl')

    # Rotate if needed
    try:
        if os.path.exists(obs_file) and os.path.getsize(obs_file) > $MAX_SIZE_BYTES:
            archive = obs_file + '.' + datetime.now().strftime('%Y%m%d%H%M%S') + '.archive'
            os.rename(obs_file, archive)
    except OSError:
        pass

    obs = {
        'timestamp': timestamp,
        'event': name,
        'tool': tool_name,
        'input': tool_input,
        'output': tool_output,
        'session': session_id,
        'project_id': project_id,
        'project_name': project_name
    }

    with open(obs_file, 'a') as f:
        f.write(json.dumps(obs) + '\n')
" 2>/dev/null | scrub_secrets

# Update offset
echo "$current_lines" > "$STATE_FILE"

# Purge old archives
find "$INSTINCTS_DIR" -name '*.archive' -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true

echo "Telemetry processing complete."
