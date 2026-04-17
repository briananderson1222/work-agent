#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export KIRO_EVAL_AGENT=stallion
exec bash "$SCRIPT_DIR/kiro-provider.sh" "$@"
