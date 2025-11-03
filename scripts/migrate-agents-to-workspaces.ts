#!/usr/bin/env tsx
/**
 * Migration script: Convert agent UI metadata to workspace configs
 * 
 * This script scans all agents for UI metadata (ui.component, ui.quickPrompts, ui.workflowShortcuts)
 * and creates corresponding workspace configurations.
 */

import * as fs from 'fs';
import * as path from 'path';

const WORK_AGENT_DIR = path.join(process.cwd(), '.work-agent');
const AGENTS_DIR = path.join(WORK_AGENT_DIR, 'agents');
const WORKSPACES_DIR = path.join(WORK_AGENT_DIR, 'workspaces');
const BACKUP_DIR = path.join(WORK_AGENT_DIR, 'backup-' + Date.now());

interface AgentConfig {
  name: string;
  prompt: string;
  model?: string;
  region?: string;
  guardrails?: any;
  tools?: any;
  ui?: {
    component?: string;
    quickPrompts?: Array<{ id: string; label: string; prompt: string }>;
    workflowShortcuts?: string[];
  };
}

interface WorkspaceConfig {
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  tabs: Array<{
    id: string;
    label: string;
    component: string;
    prompts?: Array<{
      id: string;
      label: string;
      prompt: string;
      agent?: string;
    }>;
  }>;
  globalPrompts?: Array<{
    id: string;
    label: string;
    prompt: string;
    agent?: string;
  }>;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function backupFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  
  const relativePath = path.relative(WORK_AGENT_DIR, filePath);
  const backupPath = path.join(BACKUP_DIR, relativePath);
  
  ensureDir(path.dirname(backupPath));
  fs.copyFileSync(filePath, backupPath);
  console.log(`  ✓ Backed up: ${relativePath}`);
}

function migrateAgent(agentSlug: string) {
  const agentDir = path.join(AGENTS_DIR, agentSlug);
  const agentFile = path.join(agentDir, 'agent.json');
  
  if (!fs.existsSync(agentFile)) {
    console.log(`  ⚠ Skipping ${agentSlug}: agent.json not found`);
    return;
  }
  
  const agentConfig: AgentConfig = JSON.parse(fs.readFileSync(agentFile, 'utf-8'));
  
  // Check if agent has UI metadata
  if (!agentConfig.ui || (!agentConfig.ui.component && !agentConfig.ui.quickPrompts?.length)) {
    console.log(`  ⚠ Skipping ${agentSlug}: no UI metadata found`);
    return;
  }
  
  console.log(`\n📦 Migrating agent: ${agentSlug}`);
  
  // Backup original agent.json
  backupFile(agentFile);
  
  // Create workspace config
  const workspaceSlug = `${agentSlug}-workspace`;
  const workspaceConfig: WorkspaceConfig = {
    name: `${agentConfig.name} Workspace`,
    slug: workspaceSlug,
    icon: getIconForAgent(agentSlug),
    description: `Workspace for ${agentConfig.name}`,
    tabs: [
      {
        id: 'main',
        label: 'Main',
        component: agentConfig.ui.component || 'work-agent-dashboard',
        prompts: agentConfig.ui.quickPrompts?.map(p => ({
          ...p,
          agent: agentSlug,
        })),
      },
    ],
  };
  
  // Save workspace config
  const workspaceDir = path.join(WORKSPACES_DIR, workspaceSlug);
  ensureDir(workspaceDir);
  
  const workspaceFile = path.join(workspaceDir, 'workspace.json');
  fs.writeFileSync(workspaceFile, JSON.stringify(workspaceConfig, null, 2));
  console.log(`  ✓ Created workspace: ${workspaceSlug}`);
  
  // Remove UI metadata from agent config
  const cleanedAgent = { ...agentConfig };
  delete cleanedAgent.ui;
  
  fs.writeFileSync(agentFile, JSON.stringify(cleanedAgent, null, 2));
  console.log(`  ✓ Removed UI metadata from agent.json`);
}

function getIconForAgent(slug: string): string {
  const iconMap: Record<string, string> = {
    'work-agent': '💼',
    'code-review': '🔍',
    'documentation': '📚',
    'devops': '⚙️',
    'research': '🔬',
    'sa-agent': '🏗️',
  };
  return iconMap[slug] || '📋';
}

function main() {
  console.log('🚀 Starting agent-to-workspace migration\n');
  
  // Check if .work-agent directory exists
  if (!fs.existsSync(WORK_AGENT_DIR)) {
    console.error('❌ Error: .work-agent directory not found');
    console.error('   Please run this script from the project root');
    process.exit(1);
  }
  
  // Check if agents directory exists
  if (!fs.existsSync(AGENTS_DIR)) {
    console.error('❌ Error: .work-agent/agents directory not found');
    process.exit(1);
  }
  
  // Ensure workspaces directory exists
  ensureDir(WORKSPACES_DIR);
  
  // Ensure backup directory exists
  ensureDir(BACKUP_DIR);
  
  // Get all agent directories
  const agentDirs = fs.readdirSync(AGENTS_DIR).filter(name => {
    const stat = fs.statSync(path.join(AGENTS_DIR, name));
    return stat.isDirectory();
  });
  
  if (agentDirs.length === 0) {
    console.log('⚠ No agents found to migrate');
    return;
  }
  
  console.log(`Found ${agentDirs.length} agent(s)\n`);
  
  // Migrate each agent
  let migratedCount = 0;
  for (const agentSlug of agentDirs) {
    try {
      migrateAgent(agentSlug);
      migratedCount++;
    } catch (error: any) {
      console.error(`  ❌ Error migrating ${agentSlug}:`, error.message);
    }
  }
  
  console.log(`\n✅ Migration complete!`);
  console.log(`   Migrated: ${migratedCount} agent(s)`);
  console.log(`   Backup location: ${BACKUP_DIR}`);
  console.log(`\nTo rollback, restore files from the backup directory.`);
}

main();
