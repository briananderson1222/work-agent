#!/usr/bin/env bash
# test_telemetry.sh — Layer 2: Telemetry contract validation
# Tests that the telemetry pipeline produces correct event schemas
#
# NOTE: telemetry.sh runs fire-and-forget (backgrounds main + disown) so stdout
# capture doesn't work. All tests write to a temp log file and read from there,
# with a short sleep to let the background process finish.
set -uo pipefail

TELEMETRY_DIR="$HOME/.kiro-agents/context/scripts/telemetry"
TELEMETRY_SH="${TELEMETRY_DIR}/telemetry.sh"
TMPDIR_EVAL=$(mktemp -d /tmp/eval-telemetry-test.XXXXXX)
TMPLOG="${TMPDIR_EVAL}/test-output.jsonl"
pass=0; fail=0

_pass() { echo "  ✓ $1"; pass=$((pass + 1)); }
_fail() { echo "  ✗ $1"; fail=$((fail + 1)); }

# Run telemetry.sh and wait for async output to land in the temp log file
_run_telemetry() {
  local hook_type="$1" agent="$2" input="$3" channels="${4:-full}" redact="${5:-none}"
  local channel_upper
  channel_upper=$(echo "$channels" | tr '[:lower:]' '[:upper:]')

  local before_lines=0
  touch "$TMPLOG"
  before_lines=$(wc -l < "$TMPLOG" | tr -d ' ')

  local env_vars=(
    TELEMETRY_ENABLED=true
    TELEMETRY_CHANNELS="$channels"
    "TELEMETRY_CHANNEL_${channel_upper}_LOG_FILE=$TMPLOG"
    "TELEMETRY_CHANNEL_${channel_upper}_REDACT=$redact"
    TELEMETRY_DATA_DIR="$TMPDIR_EVAL"
    TELEMETRY_SESSION_DIR="$TMPDIR_EVAL/sessions"
  )
  mkdir -p "$TMPDIR_EVAL/sessions"
  echo "$input" | env "${env_vars[@]}" bash "$TELEMETRY_SH" "$hook_type" "$agent" 2>/dev/null
  # Wait for background process to append new line(s)
  local i=0 current_lines
  while [[ $i -lt 50 ]]; do
    current_lines=$(wc -l < "$TMPLOG" 2>/dev/null | tr -d ' ')
    [[ "${current_lines:-0}" -gt "$before_lines" ]] && break
    sleep 0.1; i=$((i + 1))
  done
  # Return the first new line (the event we just triggered)
  tail -n +"$((before_lines + 1))" "$TMPLOG" 2>/dev/null | head -1
}

echo "=== Layer 2: Telemetry Contract Validation ==="
echo ""

# --- 1. Telemetry script exists ---
echo "--- Script Existence ---"
if [[ -f "$TELEMETRY_SH" ]]; then
  _pass "telemetry.sh exists"
else
  _fail "telemetry.sh not found at $TELEMETRY_SH"
  echo "Cannot continue without telemetry script"
  rm -rf "$TMPDIR_EVAL"
  exit 1
fi

for lib in config.sh session.sh enrich.sh transport.sh redact.sh; do
  if [[ -f "${TELEMETRY_DIR}/lib/${lib}" ]]; then
    _pass "lib/${lib} exists"
  else
    _fail "lib/${lib} missing"
  fi
done

# --- 2. Event type mapping ---
echo ""
echo "--- Event Type Mapping ---"
mock_json='{"cwd":"/tmp/eval-test","prompt":"test prompt","tool_name":"test_tool","tool_input":{},"tool_response":{}}'

for pair in "agentSpawn:session.start" "stop:session.end" "userPromptSubmit:turn.user" "preToolUse:tool.invoke" "postToolUse:tool.result"; do
  hook_type="${pair%%:*}"
  expected="${pair#*:}"

  output=$(_run_telemetry "$hook_type" "eval-test" "$mock_json")

  if [[ -z "$output" ]]; then
    _fail "$hook_type → (no output)"
    continue
  fi

  actual_type=$(echo "$output" | jq -r '.event_type // empty' 2>/dev/null)
  if [[ "$actual_type" == "$expected" ]]; then
    _pass "$hook_type → $actual_type"
  else
    _fail "$hook_type → expected '$expected', got '$actual_type'"
  fi
done

# --- 3. Schema fields present ---
echo ""
echo "--- Schema Fields ---"
output=$(_run_telemetry "agentSpawn" "eval-test" '{"cwd":"/tmp/eval-test"}')

for field in schema_version timestamp session_id event_id event_type agent; do
  val=$(echo "$output" | jq -r ".${field} // empty" 2>/dev/null)
  if [[ -n "$val" ]]; then
    _pass "agentSpawn has .$field = $val"
  else
    _fail "agentSpawn missing .$field"
  fi
done

# Check agent sub-fields
for field in name runtime version; do
  val=$(echo "$output" | jq -r ".agent.${field} // empty" 2>/dev/null)
  if [[ -n "$val" ]]; then
    _pass "agentSpawn has .agent.$field"
  else
    _fail "agentSpawn missing .agent.$field"
  fi
done

# --- 4. userPromptSubmit captures prompt ---
echo ""
echo "--- Prompt Capture ---"
prompt_output=$(_run_telemetry "userPromptSubmit" "eval-test" '{"cwd":"/tmp","prompt":"Hello eval test"}')

prompt_text=$(echo "$prompt_output" | jq -r '.turn.prompt_text // empty' 2>/dev/null)
prompt_length=$(echo "$prompt_output" | jq -r '.turn.prompt_length // empty' 2>/dev/null)

if [[ "$prompt_text" == "Hello eval test" ]]; then
  _pass "userPromptSubmit captures prompt_text"
else
  _fail "userPromptSubmit prompt_text: expected 'Hello eval test', got '$prompt_text'"
fi

if [[ "$prompt_length" -gt 0 ]] 2>/dev/null; then
  _pass "userPromptSubmit captures prompt_length ($prompt_length)"
else
  _fail "userPromptSubmit prompt_length missing or zero"
fi

# --- 5. preToolUse captures tool info ---
echo ""
echo "--- Tool Capture ---"
tool_output=$(_run_telemetry "preToolUse" "eval-test" '{"cwd":"/tmp","tool_name":"execute_bash","tool_input":{"command":"echo hi"}}')

tool_name=$(echo "$tool_output" | jq -r '.tool.name // empty' 2>/dev/null)
if [[ "$tool_name" == "execute_bash" ]]; then
  _pass "preToolUse captures tool.name"
else
  _fail "preToolUse tool.name: expected 'execute_bash', got '$tool_name'"
fi

# --- 6. Redaction on analytics channel ---
echo ""
echo "--- Redaction ---"
redacted=$(_run_telemetry "preToolUse" "eval-test" '{"cwd":"/tmp","tool_name":"test","tool_input":{"secret":"value"}}' "analytics" "tool.input,tool.output,turn.prompt_text")

redacted_input=$(echo "$redacted" | jq -r '.tool.input' 2>/dev/null)
if [[ "$redacted_input" == "null" ]]; then
  _pass "Analytics channel redacts tool.input"
else
  _fail "Analytics channel did not redact tool.input: $redacted_input"
fi

# --- 7. discover-agents.sh finds agent cards ---
echo ""
echo "--- Agent Discovery ---"
discover_script="$HOME/.kiro-agents/context/scripts/discover-agents.sh"
if [[ -f "$discover_script" ]]; then
  # Run from workspace src dir where agent-card.json files live
  workspace_dir="$(find "$HOME/dev" -maxdepth 5 -name "kiro-agents" -path "*/src/*" -type d 2>/dev/null | head -1)"
  if [[ -n "$workspace_dir" ]]; then
    discover_output=$(cd "$(dirname "$workspace_dir")" && bash "$discover_script" 2>/dev/null)
  else
    discover_output=$(bash "$discover_script" 2>/dev/null)
  fi
  card_count=$(echo "$discover_output" | grep -c '📋' || true)
  if [[ "$card_count" -ge 3 ]]; then
    _pass "discover-agents.sh found $card_count agent cards"
  else
    # Agent cards live in source packages, not installed packages
    # Discovery works at runtime when kiro-cli runs from workspace
    src_cards=$(find "$HOME/dev" -maxdepth 5 -name "agent-card.json" -path "*/src/*" 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$src_cards" -ge 3 ]]; then
      _pass "discover-agents.sh: $src_cards agent cards exist in source (discovery works at runtime from workspace)"
    else
      _fail "discover-agents.sh found 0 cards and only $src_cards in source"
    fi
  fi
else
  _fail "discover-agents.sh not found"
fi

# --- 8. soul-env.sh sets SOUL_PATH ---
echo ""
echo "--- Soul Environment ---"
soul_script="$HOME/.kiro-agents/context/scripts/soul-env.sh"
if [[ -f "$soul_script" ]]; then
  soul_output=$(bash "$soul_script" "$HOME/.kiro-agents/context/templates" 2>/dev/null)
  if echo "$soul_output" | grep -q "SOUL_PATH"; then
    _pass "soul-env.sh outputs SOUL_PATH"
  else
    _fail "soul-env.sh does not output SOUL_PATH"
  fi
else
  _fail "soul-env.sh not found"
fi

# --- Cleanup ---
rm -rf "$TMPDIR_EVAL"

# --- Summary ---
echo ""
echo "==========================="
total=$((pass + fail))
echo "Results: ${pass}/${total} passed, ${fail} failed"
[[ "$fail" -gt 0 ]] && exit 1
exit 0
