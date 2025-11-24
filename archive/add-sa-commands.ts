#!/usr/bin/env tsx

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const AGENT_PATH = join(process.cwd(), '.work-agent/agents/sa-agent/agent.json');
const PROMPTS_DIR = join(homedir(), '.aws/amazonq/prompts');

interface SlashCommand {
  description: string;
  prompt: string;
}

function extractFrontmatter(content: string): { description?: string; content: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    return { content };
  }

  const [, frontmatter, body] = frontmatterMatch;
  const descMatch = frontmatter.match(/description:\s*(.+)/);
  
  return {
    description: descMatch?.[1]?.trim(),
    content: body.trim()
  };
}

function main() {
  // Read agent config
  const agentConfig = JSON.parse(readFileSync(AGENT_PATH, 'utf-8'));

  // Find all sa.*.md files
  const files = readdirSync(PROMPTS_DIR)
    .filter(f => f.startsWith('sa.') && f.endsWith('.md'));

  console.log(`Found ${files.length} SA prompt files`);

  // Initialize commands object if it doesn't exist
  if (!agentConfig.commands) {
    agentConfig.commands = {};
  }

  // Process each file
  for (const file of files) {
    const filePath = join(PROMPTS_DIR, file);
    const content = readFileSync(filePath, 'utf-8');
    const { description, content: prompt } = extractFrontmatter(content);

    // Extract command name from filename (sa.activity.md -> activity)
    const commandName = file.replace(/^sa\./, '').replace(/\.md$/, '');

    agentConfig.commands[commandName] = {
      description: description || `Execute ${commandName} workflow`,
      prompt
    };

    console.log(`✓ Added /${commandName}`);
  }

  // Write back to agent config
  writeFileSync(AGENT_PATH, JSON.stringify(agentConfig, null, 2));
  console.log(`\n✅ Updated ${AGENT_PATH}`);
  console.log(`Added ${files.length} slash commands`);
}

main();
