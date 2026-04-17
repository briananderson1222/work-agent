#!/bin/bash
# Spawn hook: show boo scheduler status
if ! command -v boo &>/dev/null; then
  echo "⚠️  boo not found — scheduler features unavailable"
  exit 0
fi
echo "=== Boo Scheduler ==="
echo "Available deep links:"
echo "  boo://resume/<job>?prompt=<url-encoded-text>"
echo "  boo://run/<job>"
echo "  boo://open/<job>"
echo "Scheduled jobs:"
boo list --format json 2>/dev/null || echo "[]"
