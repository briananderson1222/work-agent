#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const Q_AGENTS_PATH = join(homedir(), '.aws', 'amazonq', 'cli-agents.json');
const WORK_AGENT_DIR = join(process.cwd(), '.work-agent', 'agents');

interface QAgent {
  name: string;
  instructions: string;
  [key: string]: any;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function importQAgents() {
  if (!existsSync(Q_AGENTS_PATH)) {
    console.error(`Q Developer agents file not found at: ${Q_AGENTS_PATH}`);
    process.exit(1);
  }

  const qAgents: QAgent[] = JSON.parse(readFileSync(Q_AGENTS_PATH, 'utf-8'));
  console.log(`Found ${qAgents.length} Q Developer agents`);

  qAgents.forEach((qAgent) => {
    const slug = `q-${slugify(qAgent.name)}`;
    const agentDir = join(WORK_AGENT_DIR, slug);

    if (existsSync(agentDir)) {
      console.log(`⚠️  Skipping ${qAgent.name} - agent already exists at ${slug}`);
      return;
    }

    mkdirSync(agentDir, { recursive: true });

    const workAgent = {
      name: qAgent.name,
      prompt: qAgent.instructions,
      model: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      guardrails: {
        maxTokens: 4096,
        temperature: 0.7,
      },
      tools: {
        mcpServers: [],
        available: [],
      },
    };

    const agentPath = join(agentDir, 'agent.json');
    writeFileSync(agentPath, JSON.stringify(workAgent, null, 2));
    console.log(`✓ Imported ${qAgent.name} → ${slug}`);
  });

  console.log('\n✨ Import complete! Restart the server to load new agents.');
}

importQAgents();
