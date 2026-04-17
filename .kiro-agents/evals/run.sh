#!/usr/bin/env bash
# run.sh — Entry point for the agent eval suite
# Usage:
#   bash run.sh              # Run layers 1+2 (fast, no LLM)
#   bash run.sh static       # Layer 1 only
#   bash run.sh integration  # Layer 2 only
#   bash run.sh llm          # Layer 3: all agents
#   bash run.sh llm dev      # Layer 3: dev agent only
#   bash run.sh llm sales-sa # Layer 3: sales-sa agent only
#   bash run.sh report dev   # Generate report from last run
#   bash run.sh llm dev --repeat 3  # Run with pass@k measurement
set -uo pipefail

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAYER="${1:-all}"
AGENT="${2:-}"

run_static() {
  echo ""
  echo "╔══════════════════════════════════════╗"
  echo "║  Layer 1: Static Package Validation  ║"
  echo "╚══════════════════════════════════════╝"
  bash "$EVAL_DIR/static/test_package.sh"
}

run_integration() {
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║  Layer 2: Telemetry Contract Validation  ║"
  echo "╚══════════════════════════════════════════╝"
  bash "$EVAL_DIR/integration/test_telemetry.sh"
}

run_llm() {
  echo ""
  echo "╔═══════════════════════════════════════╗"
  echo "║  Layer 3: LLM Behavioral Evals        ║"
  echo "╚═══════════════════════════════════════╝"
  echo ""

  if [[ -n "$AGENT" ]]; then
    local config="$EVAL_DIR/cases/$AGENT/promptfooconfig.yaml"
    if [[ ! -f "$config" ]]; then
      echo "No config found for agent '$AGENT' at $config"
      exit 1
    fi
    echo "Running evals for: $AGENT"
    cd "$EVAL_DIR/cases/$AGENT"
    mkdir -p "$EVAL_DIR/results"
    local output_file="$EVAL_DIR/results/${AGENT}-$(date +%Y-%m-%d).json"
    KIRO_EVAL_AGENT="$AGENT" promptfoo eval --no-cache --output "$output_file" "$@"
    echo ""
    echo "Results saved to: $output_file"
  else
    echo "Running all agent evals..."
    for agent_dir in "$EVAL_DIR"/cases/*/; do
      agent=$(basename "$agent_dir")
      [[ ! -f "$agent_dir/promptfooconfig.yaml" ]] && continue
      echo ""
      echo "--- $agent ---"
      cd "$agent_dir"
    mkdir -p "$EVAL_DIR/results"
      local output_file="$EVAL_DIR/results/${agent}-$(date +%Y-%m-%d).json"
      KIRO_EVAL_AGENT="$agent" promptfoo eval --no-cache --output "$output_file" "$@"
    done
  fi
  echo ""
  echo "View results: promptfoo view"
}

run_report() {
  local agent="${1:?Usage: bash run.sh report <agent>}"
  local latest
  latest=$(ls -t "$EVAL_DIR/results/${agent}"-*.json 2>/dev/null | head -1)
  if [[ -z "$latest" ]]; then
    echo "No results found for agent '$agent' in $EVAL_DIR/results/"
    exit 1
  fi
  local previous
  previous=$(ls -t "$EVAL_DIR/results/${agent}"-*.json 2>/dev/null | sed -n '2p')

  echo ""
  echo "╔══════════════════════════════╗"
  echo "║  Eval Report: $agent"
  echo "╚══════════════════════════════╝"
  echo ""

  mkdir -p "$EVAL_DIR/results/reports"
  local report_file="$EVAL_DIR/results/reports/$(date +%Y-%m-%d)-${agent}.md"
  bash "$EVAL_DIR/lib/eval-report.sh" "$latest" "$previous" | tee "$report_file"
  echo ""
  echo "Report saved to: $report_file"
}

case "$LAYER" in
  static)      run_static ;;
  integration) run_integration ;;
  llm)         shift; AGENT="${1:-}"; shift 2>/dev/null || true; run_llm "$@" ;;
  report)      shift; run_report "$@" ;;
  all)
    run_static
    static_exit=$?
    run_integration
    integration_exit=$?
    echo ""
    echo "╔══════════════════════════╗"
    echo "║  Summary: Layers 1 + 2  ║"
    echo "╚══════════════════════════╝"
    echo "  Static:      $([ $static_exit -eq 0 ] && echo PASS || echo FAIL)"
    echo "  Integration: $([ $integration_exit -eq 0 ] && echo PASS || echo FAIL)"
    echo ""
    if [[ $static_exit -ne 0 || $integration_exit -ne 0 ]]; then
      echo "Fix Layer 1/2 failures before running Layer 3."
      exit 1
    fi
    echo "Layers 1+2 passed. Run 'bash run.sh llm [dev|sales-sa]' for behavioral evals."
    ;;
  *)
    echo "Usage: bash run.sh [static|integration|llm|report|all] [agent-name]"
    exit 1
    ;;
esac
