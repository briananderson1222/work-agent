#!/bin/bash
# setup-instinct-jobs.sh — Set up boo jobs for the continuous learning system
set -e

command -v boo >/dev/null 2>&1 || { echo "boo not installed. Install boo first."; exit 1; }

SOUL_PATH="${SOUL_PATH:-$HOME/.soul}"

# Analysis job: runs 3x/day on weekdays
boo add \
  --name "stallion-instinct-analysis" \
  --cron "0 10,14,18 * * 1-5" \
  --agent dev \
  --prompt "@instinct-analysis" \
  --working-dir "$SOUL_PATH" \
  --trust-tools 'knowledge,fs_read,fs_write,thinking,glob,grep' \
  --timeout 300 \
  --description "Analyze observations → create/update instincts"

# Promotion check: runs weekly on Friday
boo add \
  --name "stallion-instinct-promote" \
  --cron "0 16 * * 5" \
  --agent dev \
  --prompt "@instinct-promote" \
  --working-dir "$SOUL_PATH" \
  --trust-tools 'knowledge,fs_read,fs_write,thinking,glob,grep' \
  --timeout 180 \
  --description "Check for instincts ready to promote project→global"

# Evolution check: runs monthly on 1st
boo add \
  --name "stallion-instinct-evolve" \
  --cron "0 10 1 * *" \
  --agent dev \
  --prompt "@instinct-evolve" \
  --working-dir "$SOUL_PATH" \
  --trust-tools 'knowledge,fs_read,fs_write,thinking,glob,grep' \
  --timeout 300 \
  --description "Cluster high-confidence instincts → propose evolution"

echo "Instinct learning jobs created. Verify with: boo list"
