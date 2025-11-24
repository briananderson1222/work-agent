import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const agentPath = '.work-agent/agents/stallion-workspace:work-agent/agent.json';
const promptsDir = join(homedir(), '.aws/amazonq/prompts');

const commands = {
  activity: {
    name: 'activity',
    description: 'Review customer meetings and identify which need activity logging in Salesforce',
    prompt: readFileSync(join(promptsDir, 'sa.activity.md'), 'utf-8')
  },
  daily: {
    name: 'daily',
    description: 'Daily overview (start of day) or wrap-up (end of day) with calendar, email, and priorities',
    prompt: readFileSync(join(promptsDir, 'sa.daily.md'), 'utf-8')
  },
  highlight: {
    name: 'highlight',
    description: 'Create quarterly SA Highlight narrative from MBR data for USGF leadership review',
    prompt: readFileSync(join(promptsDir, 'sa.highlight.md'), 'utf-8')
  },
  insight: {
    name: 'insight',
    description: 'Generate leadership insights from Salesforce tasks and activities',
    prompt: readFileSync(join(promptsDir, 'sa.insight.md'), 'utf-8')
  }
};

const agent = JSON.parse(readFileSync(agentPath, 'utf-8'));
agent.commands = commands;
writeFileSync(agentPath, JSON.stringify(agent, null, 2));

console.log('✓ Added slash commands to agent.json');
