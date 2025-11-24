#!/usr/bin/env tsx
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PROMPTS_DIR = join(homedir(), '.aws/amazonq/prompts');
const AGENT_PATH = join(process.cwd(), '.work-agent/agents/sa-agent/agent.json');

function parseMarkdownPrompt(content: string, filename: string) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let description = '';
  
  if (frontmatterMatch) {
    const descMatch = frontmatterMatch[1].match(/description:\s*(.+)/);
    if (descMatch) description = descMatch[1].trim();
  }

  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : filename.replace('sa.', '').replace('.md', '');

  const workflowMatch = content.match(/##\s+Workflow\n\n([\s\S]+?)(?=\n##|$)/);
  const prompt = workflowMatch ? workflowMatch[1].trim() : content;

  const name = filename.replace('sa.', '').replace('.md', '');

  return {
    name,
    description: description || `Execute ${title}`,
    prompt: `# ${title}\n\n${prompt}`
  };
}

const files = readdirSync(PROMPTS_DIR).filter(f => f.startsWith('sa.') && f.endsWith('.md'));
console.log(`Found ${files.length} prompt files\n`);

const commands: Record<string, any> = {};

for (const file of files) {
  const content = readFileSync(join(PROMPTS_DIR, file), 'utf-8');
  const parsed = parseMarkdownPrompt(content, file);
  commands[parsed.name] = parsed;
  console.log(`  ✓ ${parsed.name}: ${parsed.description}`);
}

const agentConfig = JSON.parse(readFileSync(AGENT_PATH, 'utf-8'));
agentConfig.commands = { ...agentConfig.commands, ...commands };
writeFileSync(AGENT_PATH, JSON.stringify(agentConfig, null, 2));

console.log(`\n✓ Imported ${Object.keys(commands).length} commands`);
