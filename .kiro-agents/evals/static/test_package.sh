#!/usr/bin/env bash
# test_package.sh — Layer 1: Static validation of installed agent package
# Extends validate-package.sh with comprehensive checks
set -uo pipefail

AGENTS_DIR="$HOME/.kiro/agents"

# Auto-detect install mode: local (default) or VS-installed packages
# Override: EVAL_MODE=vs bash evals/run.sh static
EVAL_MODE="${EVAL_MODE:-auto}"
if [[ "$EVAL_MODE" == "auto" ]]; then
  if ls "$AGENTS_DIR"/*.json &>/dev/null; then
    EVAL_MODE="local"
  else
    EVAL_MODE="vs"
  fi
fi

if [[ "$EVAL_MODE" == "local" ]]; then
  PACKAGE_DIR="$HOME/.kiro-agents"
  AGENT_GLOB="$AGENTS_DIR/*.json"
else
  PACKAGE_DIR="$HOME/.kiro-agents"
  AGENT_GLOB="$AGENTS_DIR/kiro-agents-*.json"
fi
# Collect matching agent files once
AGENT_FILES=()
for _f in $AGENT_GLOB; do [[ -f "$_f" ]] && AGENT_FILES+=("$_f"); done
pass=0; fail=0; skip=0

_pass() { echo "  ✓ $1"; pass=$((pass + 1)); }
_fail() { echo "  ✗ $1"; fail=$((fail + 1)); }
_skip() { echo "  ○ $1"; skip=$((skip + 1)); }

echo "=== Layer 1: Static Package Validation ==="
echo "Mode: ${EVAL_MODE}"
echo ""

# --- 1. Agent count ---
count=${#AGENT_FILES[@]}
echo "Agents found: ${count}"
[[ "$count" -eq 0 ]] && echo "✗ No agents found" && exit 1

# --- 2. Schema validation ---
echo ""
echo "--- Schema ---"
for f in "${AGENT_FILES[@]}"; do
  name=$(jq -r '.name // empty' "$f" 2>/dev/null)
  [[ -z "$name" ]] && { _fail "$(basename "$f"): missing .name"; continue; }

  has_all=$(jq -r 'if .name and .prompt and .model and .description then "yes" else "no" end' "$f" 2>/dev/null)
  if [[ "$has_all" != "yes" ]]; then
    _fail "$name: missing required field (name/prompt/model/description)"
  elif ! echo "$name" | grep -qE '^[a-z][a-z0-9-]*$'; then
    _fail "$name: invalid name format (must match ^[a-z][a-z0-9-]*$)"
  else
    _pass "$name: schema valid"
  fi
done

# --- 3. No unresolved templates ---
echo ""
echo "--- Templates ---"
for f in "${AGENT_FILES[@]}"; do
  name=$(jq -r '.name' "$f" 2>/dev/null)
  if grep -q '{{aim:' "$f" 2>/dev/null; then
    _fail "$name: unresolved {{aim:}} template"
  else
    _pass "$name: templates resolved"
  fi
done

# --- 4. Hook scripts exist ---
echo ""
echo "--- Hooks ---"
for f in "${AGENT_FILES[@]}"; do
  name=$(jq -r '.name' "$f" 2>/dev/null)
  hook_fail=0
  while read -r cmd; do
    [[ -z "$cmd" ]] && continue
    script=$(echo "$cmd" | sed 's/^bash //' | awk '{print $1}')
    if [[ -f "$script" ]] || command -v "$script" >/dev/null 2>&1; then
      :
    else
      _fail "$name: hook script missing: $(basename "$script")"
      hook_fail=1
    fi
  done < <(jq -r '.hooks // {} | to_entries[] | .value[] | .command // empty' "$f" 2>/dev/null)
  hcount=$(jq '[.hooks // {} | .[] | .[]] | length' "$f" 2>/dev/null)
  [[ "$hcount" -gt 0 && "$hook_fail" -eq 0 ]] && _pass "$name: $hcount hooks, scripts exist"
done

# --- 5. Resource paths resolve ---
echo ""
echo "--- Resources ---"
for f in "${AGENT_FILES[@]}"; do
  name=$(jq -r '.name' "$f" 2>/dev/null)
  rfail=0
  while read -r res; do
    rpath="${res#file://}"
    rpath="${rpath/#\~/$HOME}"
    [[ "$rpath" == *"*"* || "$rpath" != /* ]] && continue
    if [[ ! -f "$rpath" && ! -d "$rpath" ]]; then
      _fail "$name: resource missing: $rpath"
      rfail=1
    fi
  done < <(jq -r '.resources // [] | .[] | select(type == "string") | select(startswith("file://"))' "$f" 2>/dev/null)
  [[ "$rfail" -eq 0 ]] && _pass "$name: file:// resources resolve"
done

# --- 6. Subagent routing ---
echo ""
echo "--- Subagent Routing ---"
all_agents=$(for f in "${AGENT_FILES[@]}"; do jq -r '.name' "$f" 2>/dev/null; done)
for f in "${AGENT_FILES[@]}"; do
  name=$(jq -r '.name' "$f" 2>/dev/null)
  patterns=$(jq -r '.toolsSettings.subagent.availableAgents // [] | .[]' "$f" 2>/dev/null)
  [[ -z "$patterns" ]] && continue
  for pat in $patterns; do
    # Convert glob to regex
    regex=$(echo "$pat" | sed 's/\*/.*/')
    matched=$(echo "$all_agents" | grep -cE "^${regex}$")
    if [[ "$matched" -gt 0 ]]; then
      _pass "$name: pattern '$pat' matches $matched agent(s)"
    else
      _fail "$name: pattern '$pat' matches no installed agents"
    fi
  done
done

# --- 7. MCP servers on PATH ---
echo ""
echo "--- MCP Servers ---"
for f in "${AGENT_FILES[@]}"; do
  name=$(jq -r '.name' "$f" 2>/dev/null)
  jq -r '.mcpServers // {} | to_entries[] | .value.command' "$f" 2>/dev/null | while read -r cmd; do
    [[ -z "$cmd" ]] && continue
    if command -v "$cmd" >/dev/null 2>&1; then
      _pass "$name: MCP '$cmd' on PATH"
    else
      _fail "$name: MCP '$cmd' not on PATH"
    fi
  done
done

# --- 8. Knowledge base sources ---
echo ""
echo "--- Knowledge Bases ---"
for f in "${AGENT_FILES[@]}"; do
  name=$(jq -r '.name' "$f" 2>/dev/null)
  while read -r src; do
    spath="${src#file://}"
    spath="${spath/#\~/$HOME}"
    if [[ -d "$spath" ]]; then
      fcount=$(find "$spath" -type f 2>/dev/null | head -100 | wc -l | tr -d ' ')
      _pass "$name: KB source '$spath' exists ($fcount files)"
    else
      _fail "$name: KB source missing: $spath"
    fi
  done < <(jq -r '.resources // [] | .[] | select(type == "object") | select(.type == "knowledgeBase") | .source' "$f" 2>/dev/null)
done

# --- 9. tool-* agents should not have write tools ---
echo ""
echo "--- Write Tool Invariant ---"
WRITE_TOOLS='fs_write|write'
for f in "${AGENT_FILES[@]}"; do
  name=$(jq -r '.name' "$f" 2>/dev/null)
  [[ "$name" != tool-* ]] && continue
  allowed=$(jq -r '.allowedTools // [] | .[]' "$f" 2>/dev/null)
  if echo "$allowed" | grep -qE "^(${WRITE_TOOLS})$"; then
    # Allow write if scoped via toolsSettings.write.allowedPaths
    scoped=$(jq -r '.toolsSettings.write.allowedPaths // [] | length' "$f" 2>/dev/null)
    if [[ "$scoped" -gt 0 ]]; then
      paths=$(jq -r '.toolsSettings.write.allowedPaths | join(", ")' "$f" 2>/dev/null)
      _pass "$name: write scoped to [$paths]"
    else
      _fail "$name: has write tools in allowedTools"
    fi
  else
    _pass "$name: no write tools (read-only)"
  fi
done

# --- 10. Agent cards match installed agents ---
echo ""
echo "--- Agent Cards ---"
if [[ "$EVAL_MODE" == "local" ]]; then
  card_globs=("$PACKAGE_DIR"/../*/agent-card.json "$PACKAGE_DIR"/../../*/agent-card.json)
else
  card_globs=("$PACKAGE_DIR"/agent-card.json)
fi
for card in "${card_globs[@]}"; do
  [[ -f "$card" ]] || continue
  agent=$(python3 -c "import json; print(json.load(open('$card')).get('agent',''))" 2>/dev/null)
  [[ -z "$agent" ]] && continue
  if ls "$AGENTS_DIR"/*-"${agent}.json" &>/dev/null; then
    _pass "Agent card '$agent' has matching installed agent"
  else
    _fail "Agent card '$agent' has no matching installed agent"
  fi
done

# --- Summary ---
echo ""
echo "==========================="
total=$((pass + fail))
echo "Results: ${pass}/${total} passed, ${fail} failed, ${skip} skipped"
[[ "$fail" -gt 0 ]] && exit 1
exit 0
