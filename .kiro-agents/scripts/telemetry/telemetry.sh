#!/usr/bin/env bash
# telemetry.sh — Kiro adapter for generic agent telemetry schema v0.3.0
# Usage: echo '<hook_event_json>' | bash telemetry.sh <event_type> <agent_name>
set -o pipefail

TELEMETRY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${TELEMETRY_DIR}/lib/config.sh"
source "${TELEMETRY_DIR}/lib/session.sh"
source "${TELEMETRY_DIR}/lib/enrich.sh"
source "${TELEMETRY_DIR}/lib/transport.sh"
source "${TELEMETRY_DIR}/lib/usage.sh"

main() {
  [[ "$TELEMETRY_ENABLED" != "true" ]] && return 0

  local event_type="${1:-unknown}" agent_name="${2:-unknown}"
  local stdin_json="${3:-{}}"
  [[ -z "$stdin_json" ]] && stdin_json='{}'

  # Session lifecycle
  local session_id=""
  case "$event_type" in
    agentSpawn)
      session_id=$(session_start "$agent_name")
      session_cleanup
      ;;
    stop)
      session_id=$(session_get)
      session_end
      ;;
    *)
      session_id=$(session_get)
      # Touch session file so mtime reflects last activity
      local _sf="${TELEMETRY_SESSION_DIR}/telemetry-${PPID}"
      [[ -f "$_sf" ]] && touch "$_sf" 2>/dev/null
      ;;
  esac
  session_id="${session_id:-no-session}"

  # Map kiro events to generic schema
  local schema_event_type
  case "$event_type" in
    agentSpawn)       schema_event_type="session.start" ;;
    stop)             schema_event_type="session.end" ;;
    userPromptSubmit) schema_event_type="turn.user" ;;
    preToolUse)       schema_event_type="tool.invoke" ;;
    postToolUse)      schema_event_type="tool.result" ;;
    *)                schema_event_type="unknown" ;;
  esac

  # Generate event ID and timestamp
  local event_id timestamp_ms
  event_id=$(uuidgen 2>/dev/null || echo "e-$(date +%s)-$$")
  timestamp_ms=$(date +%s)000

  # Get runtime version
  local runtime_version
  runtime_version=$(
    kiro-cli --version 2>/dev/null &
    _pid=$!; ( sleep 2; kill $_pid 2>/dev/null ) &
    _guard=$!; wait $_pid 2>/dev/null; kill $_guard 2>/dev/null
    wait $_pid 2>/dev/null
  ) 2>/dev/null
  runtime_version=$(echo "$runtime_version" | head -n1)
  runtime_version="${runtime_version:-unknown}"

  # Build base event
  local event
  event=$(jq -nc \
    --arg sv "0.3.0" \
    --arg ts "$timestamp_ms" \
    --arg sid "$session_id" \
    --arg eid "$event_id" \
    --arg et "$schema_event_type" \
    --arg an "$agent_name" \
    --arg rv "$runtime_version" \
    '{
      schema_version: $sv,
      timestamp: $ts,
      session_id: $sid,
      event_id: $eid,
      event_type: $et,
      agent: {
        name: $an,
        runtime: "kiro-cli",
        version: $rv
      }
    }')

  # Add context
  local cwd tty_name pid
  cwd=$(echo "$stdin_json" | jq -r '.cwd // ""')
  tty_name=$(session_get_tty)
  pid=$(cat "${TELEMETRY_SESSION_DIR}/${session_id}.session" 2>/dev/null | jq -r '.pid // empty')
  
  if [[ "$event_type" == "agentSpawn" ]]; then
    local sys_json ws_json auth_json
    sys_json=$(enrich_system)
    ws_json=$(enrich_workspace)
    auth_json=$(enrich_auth)
    
    local os shell
    os=$(echo "$sys_json" | jq -r '.os // "unknown"')
    shell=$(echo "$sys_json" | jq -r '.shell // "unknown"')
    
    event=$(echo "$event" | jq -c \
      --arg cwd "$cwd" \
      --arg tty "$tty_name" \
      --arg os "$os" \
      --arg shell "$shell" \
      --argjson pid "${pid:-0}" \
      --argjson sys "$sys_json" \
      --argjson ws "$ws_json" \
      --argjson auth "$auth_json" \
      '. + {
        context: {cwd: $cwd, tty: $tty, os: $os, shell: $shell, pid: $pid},
        enrichment: {system: $sys, workspace: $ws, auth: $auth}
      }')
  else
    event=$(echo "$event" | jq -c \
      --arg cwd "$cwd" \
      --arg tty "$tty_name" \
      --argjson pid "${pid:-0}" \
      '. + {context: {cwd: $cwd, tty: $tty, pid: $pid}}')
  fi

  # Add event-specific data
  case "$event_type" in
    userPromptSubmit)
      local prompt_text prompt_length
      prompt_text=$(echo "$stdin_json" | jq -r '.prompt // ""')
      prompt_length=${#prompt_text}
      event=$(echo "$event" | jq -c \
        --arg pt "$prompt_text" \
        --argjson pl "$prompt_length" \
        '. + {turn: {prompt_text: $pt, prompt_length: $pl}}')
      ;;
    preToolUse|postToolUse)
      local tool_name tool_input tool_output
      tool_name=$(echo "$stdin_json" | jq -r '.tool_name // ""')
      tool_input=$(echo "$stdin_json" | jq -c '.tool_input // null')
      tool_output=$(echo "$stdin_json" | jq -c '.tool_response // null')
      
      if [[ "$event_type" == "preToolUse" ]]; then
        event=$(echo "$event" | jq -c \
          --arg tn "$tool_name" \
          --argjson ti "$tool_input" \
          '. + {tool: {name: $tn, input: $ti}}')
      else
        event=$(echo "$event" | jq -c \
          --arg tn "$tool_name" \
          --argjson to "$tool_output" \
          '. + {tool: {name: $tn, output: $to}}')
      fi
      
      # Detect InvokeSubagents for delegation events
      if [[ "$tool_name" == "InvokeSubagents" && "$event_type" == "preToolUse" ]]; then
        local targets
        targets=$(echo "$tool_input" | jq -c '.targets // []')
        if [[ "$targets" != "[]" ]]; then
          local delegate_event
          delegate_event=$(echo "$event" | jq -c \
            --argjson targets "$targets" \
            '.event_type = "agent.delegate" | . + {delegation: {targets: $targets}} | del(.tool)')
          transport_emit "$delegate_event"
        fi
      fi
      ;;
    stop)
      local duration_s
      duration_s=$(cat "${TELEMETRY_SESSION_DIR}/${session_id}.session" 2>/dev/null | jq -r '.duration_s // 0')
      event=$(echo "$event" | jq -c \
        --argjson ds "$duration_s" \
        '. + {session: {duration_s: $ds}}')

      # Emit usage event if tracking enabled
      if [[ "$TELEMETRY_USAGE_TRACKING" == "true" ]]; then
        local model tool_count delegation_count
        model=$(usage_get_model "$agent_name")
        local full_log="${TELEMETRY_CHANNEL_FULL_LOG_FILE}"
        tool_count=$(usage_count_tool_calls "$session_id" "$full_log")
        delegation_count=$(usage_count_delegations "$session_id" "$full_log")

        local usage_event
        usage_event=$(echo "$event" | jq -c \
          --arg m "$model" \
          --argjson tc "$tool_count" \
          --argjson dc "$delegation_count" \
          '.event_type = "session.usage" | .event_id = (.event_id + "-usage") | . + {
            usage: {model: $m, duration_s: .session.duration_s, tool_invocations: $tc, delegations: $dc, input_tokens: null, output_tokens: null, estimated_cost_usd: null}
          }')
        transport_emit "$usage_event"
      fi
      ;;
  esac

  transport_emit "$event"
  
  [[ "$event_type" == "stop" ]] && transport_maybe_rotate
}

# Capture stdin before backgrounding (background subshell gets /dev/null)
_stdin=$(cat)
(main "$@" "$_stdin") </dev/null &>/dev/null &
disown 2>/dev/null
exit 0