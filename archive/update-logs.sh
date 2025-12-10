#!/bin/bash

# Update all console.error to log.api in context files
find src-ui/src/contexts -type f -name "*.tsx" -exec sed -i '' "s/console\.error(/log.api(/g" {} \;

# Update console.warn to log.debug in ActiveChatsContext (storage warnings)
sed -i '' "s/console\.warn('Failed to load active chats/log.debug('Failed to load active chats/g" src-ui/src/contexts/ActiveChatsContext.tsx
sed -i '' "s/console\.warn('Failed to save active chats/log.debug('Failed to save active chats/g" src-ui/src/contexts/ActiveChatsContext.tsx

# Remove debug console.logs from ActiveChatsContext (history navigation)
sed -i '' "/console\.log('\[History/d" src-ui/src/contexts/ActiveChatsContext.tsx

# Update MonitoringContext
sed -i '' "s/console\.warn('No heartbeat/log.debug('No heartbeat/g" src-ui/src/contexts/MonitoringContext.tsx

# Update PluginRegistry
sed -i '' "s/console\.warn(\`\[PluginRegistry\]/log.debug(\`[PluginRegistry]/g" src-ui/src/core/PluginRegistry.ts
sed -i '' "s/console\.log(\`\[PluginRegistry\]/log.debug(\`[PluginRegistry]/g" src-ui/src/core/PluginRegistry.ts
sed -i '' "s/console\.error(\`\[PluginRegistry\]/log.api(\`[PluginRegistry]/g" src-ui/src/core/PluginRegistry.ts

# Update component files
find src-ui/src/components -type f -name "*.tsx" -exec sed -i '' "s/console\.error(/log.api(/g" {} \;
sed -i '' "s/console\.log('Auto-rescanning/log.debug('Auto-rescanning/g" src-ui/src/components/UsageStatsPanel.tsx

# Update hooks
find src-ui/src/hooks -type f -name "*.ts" -exec sed -i '' "s/console\.error(/log.api(/g" {} \;

# Update views
find src-ui/src/views -type f -name "*.tsx" -exec sed -i '' "s/console\.error(/log.api(/g" {} \;

# Update App.tsx
sed -i '' "s/console\.error('Failed to load workspace/log.api('Failed to load workspace/g" src-ui/src/App.tsx

# Remove debug logs from main.tsx (hash tracking)
sed -i '' "/console\.log('\[GLOBAL\]/d" src-ui/src/main.tsx
sed -i '' "/console\.trace('\[GLOBAL\]/d" src-ui/src/main.tsx

# Remove debug logs from stallion workspace
sed -i '' "/console\.log('\[CRM\]/d" src-ui/src/workspaces/stallion-workspace/CRM.tsx
sed -i '' "/console\.log('\[Calendar\]/d" src-ui/src/workspaces/stallion-workspace/Calendar.tsx
sed -i '' "/console\.log('Debug - Total events/d" src-ui/src/workspaces/stallion-workspace/Calendar.tsx
sed -i '' "/console\.log('Waiting for agents/d" src-ui/src/workspaces/stallion-workspace/Calendar.tsx
sed -i '' "s/console\.error(/log.api(/g" src-ui/src/workspaces/stallion-workspace/CRM.tsx
sed -i '' "s/console\.error(/log.api(/g" src-ui/src/workspaces/stallion-workspace/Calendar.tsx

# Remove debug logs from stallion hooks
sed -i '' "/console\.log(/d" src-ui/src/workspaces/stallion-workspace/hooks.ts

# Remove debug log from Header
sed -i '' "/console\.log('Header:/,/});/d" src-ui/src/components/Header.tsx

# Update lib/tauri.ts
sed -i '' "s/console\.error('Failed to open research URL/log.api('Failed to open research URL/g" src-ui/src/lib/tauri.ts

echo "Console logs updated. Now adding imports..."
