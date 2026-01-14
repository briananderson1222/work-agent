#!/bin/bash

files=(
  "src-ui/src/contexts/AgentsContext.tsx"
  "src-ui/src/contexts/ActiveChatsContext.tsx"
  "src-ui/src/contexts/AppDataContext.tsx"
  "src-ui/src/contexts/ConfigContext.tsx"
  "src-ui/src/contexts/ConversationsContext.tsx"
  "src-ui/src/contexts/ModelCapabilitiesContext.tsx"
  "src-ui/src/contexts/ModelsContext.tsx"
  "src-ui/src/contexts/MonitoringContext.tsx"
  "src-ui/src/contexts/StatsContext.tsx"
  "src-ui/src/contexts/WorkflowsContext.tsx"
  "src-ui/src/contexts/WorkspacesContext.tsx"
  "src-ui/src/core/PluginRegistry.ts"
  "src-ui/src/hooks/useAwsAuth.ts"
  "src-ui/src/hooks/useStreamingMessage.ts"
  "src-ui/src/hooks/useToolApproval.ts"
  "src-ui/src/lib/tauri.ts"
  "src-ui/src/components/SessionManagementMenu.tsx"
  "src-ui/src/components/SessionPickerModal.tsx"
  "src-ui/src/components/UsageStatsPanel.tsx"
  "src-ui/src/views/AgentEditorView.tsx"
  "src-ui/src/views/SettingsView.tsx"
  "src-ui/src/views/WorkspaceEditorView.tsx"
  "src-ui/src/App.tsx"
  "src-ui/src/workspaces/stallion-workspace/CRM.tsx"
  "src-ui/src/workspaces/stallion-workspace/Calendar.tsx"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    # Check if import already exists
    if ! grep -q "from '@/utils/logger'" "$file"; then
      # Add import after the first import statement
      sed -i '' "1,/^import/s/^\(import.*\)$/\1\nimport { log } from '@\/utils\/logger';/" "$file"
    fi
  fi
done

echo "Logger imports added to all files"
