#!/bin/bash
# Backwards compatibility — redirects to soul-env.sh
# Remove this file once all dependent packages update their agent specs.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/soul-env.sh" "$@"
