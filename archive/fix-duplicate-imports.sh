#!/bin/bash

files=(
  "src-ui/src/contexts/ActiveChatsContext.tsx"
  "src-ui/src/contexts/MonitoringContext.tsx"
  "src-ui/src/contexts/ConversationsContext.tsx"
  "src-ui/src/workspaces/stallion-workspace/CRM.tsx"
  "src-ui/src/workspaces/stallion-workspace/Calendar.tsx"
  "src-ui/src/components/SessionManagementMenu.tsx"
  "src-ui/src/components/UsageStatsPanel.tsx"
  "src-ui/src/hooks/useToolApproval.ts"
  "src-ui/src/hooks/useAwsAuth.ts"
  "src-ui/src/hooks/useStreamingMessage.ts"
  "src-ui/src/views/AgentEditorView.tsx"
  "src-ui/src/views/SettingsView.tsx"
  "src-ui/src/views/WorkspaceEditorView.tsx"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    # Keep only the first occurrence of the logger import
    awk '!seen[$0]++ || !/from .@\/utils\/logger/' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  fi
done

echo "Duplicate imports removed"
