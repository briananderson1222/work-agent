import { existsSync } from 'node:fs';
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { AgentMetadata, AgentSpec } from '@stallion-ai/contracts/agent';
import type { WorkflowMetadata } from '@stallion-ai/contracts/runtime';
import { assertSafeContextText } from '../services/context-safety.js';
import { createLogger } from '../utils/logger.js';
import { validator } from './validator.js';

const logger = createLogger({ name: 'config-loader' });

const WORKFLOW_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs'];

export async function loadAgentConfig(
  projectHomeDir: string,
  slug: string,
): Promise<AgentSpec> {
  const path = join(projectHomeDir, 'agents', slug, 'agent.json');

  if (!existsSync(path)) {
    throw new Error(`Agent '${slug}' not found at ${path}`);
  }

  const content = await readFile(path, 'utf-8');
  const data = JSON.parse(content);
  validator.validateAgentSpec(data);
  assertSafeAgentSpec(slug, data);
  return data;
}

export async function saveAgentConfig(
  projectHomeDir: string,
  slug: string,
  spec: AgentSpec,
): Promise<void> {
  validator.validateAgentSpec(spec);
  assertSafeAgentSpec(slug, spec);

  const agentDir = join(projectHomeDir, 'agents', slug);
  await mkdir(agentDir, { recursive: true });
  await mkdir(join(agentDir, 'memory', 'sessions'), { recursive: true });
  await mkdir(join(agentDir, 'workflows'), { recursive: true });

  const path = join(agentDir, 'agent.json');
  await writeFile(path, JSON.stringify(spec, null, 2), 'utf-8');
}

export async function createAgentConfig(
  projectHomeDir: string,
  spec: AgentSpec,
): Promise<{ slug: string; spec: AgentSpec }> {
  const slug =
    (spec as { slug?: string }).slug?.trim() ||
    spec.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  if (!slug) {
    throw new Error(
      'Agent name must contain at least one alphanumeric character',
    );
  }

  if (await agentConfigExists(projectHomeDir, slug)) {
    throw new Error(`Agent with slug '${slug}' already exists`);
  }

  const { slug: _ignored, ...cleanSpec } = spec as AgentSpec & {
    slug?: string;
  };
  await saveAgentConfig(projectHomeDir, slug, cleanSpec);
  return { slug, spec: cleanSpec };
}

export async function updateAgentConfig(
  projectHomeDir: string,
  slug: string,
  updates: Partial<AgentSpec>,
): Promise<AgentSpec> {
  const existing = await loadAgentConfig(projectHomeDir, slug);

  const {
    slug: _ignored,
    updatedAt,
    workflowWarnings,
    ...cleanUpdates
  } = updates as Partial<AgentSpec> & {
    slug?: string;
    updatedAt?: string;
    workflowWarnings?: string[];
  };

  const filteredUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cleanUpdates)) {
    if (value !== undefined) {
      filteredUpdates[key] = value;
    }
  }

  const updated = { ...existing, ...filteredUpdates };
  await saveAgentConfig(projectHomeDir, slug, updated);
  return updated;
}

export async function deleteAgentConfig(
  projectHomeDir: string,
  slug: string,
): Promise<void> {
  const agentDir = join(projectHomeDir, 'agents', slug);

  if (!existsSync(agentDir)) {
    throw new Error(`Agent '${slug}' not found`);
  }

  await rm(agentDir, { recursive: true, force: true });
}

export async function listAgentConfigs(
  projectHomeDir: string,
): Promise<AgentMetadata[]> {
  const agentsDir = join(projectHomeDir, 'agents');

  if (!existsSync(agentsDir)) {
    return [];
  }

  const entries = await readdir(agentsDir, { withFileTypes: true });
  const agents: AgentMetadata[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const agentPath = join(agentsDir, entry.name, 'agent.json');
    if (!existsSync(agentPath)) continue;

    try {
      const spec = await loadAgentConfig(projectHomeDir, entry.name);
      const stats = await stat(agentPath);
      const workflowWarnings = await validateWorkflowShortcuts(
        projectHomeDir,
        entry.name,
        spec.ui?.workflowShortcuts,
      );
      const pluginName = entry.name.includes(':')
        ? entry.name.split(':')[0]
        : undefined;

      agents.push({
        slug: entry.name,
        name: spec.name,
        model: spec.model,
        updatedAt: stats.mtime.toISOString(),
        description: spec.prompt,
        plugin: pluginName,
        ui: spec.ui,
        workflowWarnings:
          workflowWarnings.length > 0 ? workflowWarnings : undefined,
      });
    } catch (error: any) {
      logger.error('Failed to load agent', {
        agent: entry.name,
        error: error.message || error,
      });
      if (error.name === 'ValidationError') {
        logger.error('Validation errors', { errors: error.errors });
      }
    }
  }

  return agents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listAgentWorkflowMetadata(
  projectHomeDir: string,
  slug: string,
): Promise<WorkflowMetadata[]> {
  const workflowsDir = join(projectHomeDir, 'agents', slug, 'workflows');

  if (!existsSync(workflowsDir)) {
    return [];
  }

  const entries = await readdir(workflowsDir, { withFileTypes: true });
  const workflows: WorkflowMetadata[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const ext = extname(entry.name).toLowerCase();
    if (!WORKFLOW_EXTENSIONS.includes(ext)) continue;

    const id = entry.name;
    const filePath = join(workflowsDir, entry.name);
    const stats = await stat(filePath);

    workflows.push({
      id,
      label: deriveWorkflowLabel(id),
      filename: entry.name,
      lastModified: stats.mtime.toISOString(),
    });
  }

  return workflows.sort((a, b) => a.label.localeCompare(b.label));
}

export async function createAgentWorkflow(
  projectHomeDir: string,
  slug: string,
  filename: string,
  content: string,
): Promise<void> {
  const ext = extname(filename).toLowerCase();
  if (!WORKFLOW_EXTENSIONS.includes(ext)) {
    throw new Error('Workflow filename must end with .ts, .js, .mjs, or .cjs');
  }

  const workflowsDir = join(projectHomeDir, 'agents', slug, 'workflows');
  await mkdir(workflowsDir, { recursive: true });

  const path = join(workflowsDir, filename);
  if (existsSync(path)) {
    throw new Error(`Workflow '${filename}' already exists`);
  }

  assertSafeContextText(content, {
    source: `workflow '${filename}' for agent '${slug}'`,
  });
  await writeFile(path, content, 'utf-8');
}

export async function readAgentWorkflow(
  projectHomeDir: string,
  slug: string,
  workflowId: string,
): Promise<string> {
  const path = join(projectHomeDir, 'agents', slug, 'workflows', workflowId);

  if (!existsSync(path)) {
    throw new Error(`Workflow '${workflowId}' not found`);
  }

  const content = await readFile(path, 'utf-8');
  assertSafeContextText(content, {
    source: `workflow '${workflowId}' for agent '${slug}'`,
  });
  return content;
}

export async function updateAgentWorkflow(
  projectHomeDir: string,
  slug: string,
  workflowId: string,
  content: string,
): Promise<void> {
  const path = join(projectHomeDir, 'agents', slug, 'workflows', workflowId);

  if (!existsSync(path)) {
    throw new Error(`Workflow '${workflowId}' not found`);
  }

  assertSafeContextText(content, {
    source: `workflow '${workflowId}' for agent '${slug}'`,
  });
  await writeFile(path, content, 'utf-8');
}

export async function deleteAgentWorkflow(
  projectHomeDir: string,
  slug: string,
  workflowId: string,
): Promise<void> {
  const path = join(projectHomeDir, 'agents', slug, 'workflows', workflowId);

  if (!existsSync(path)) {
    throw new Error(`Workflow '${workflowId}' not found`);
  }

  await rm(path, { force: true });
}

export async function getAgentToolMap(projectHomeDir: string) {
  const agentsDir = join(projectHomeDir, 'agents');
  const map: Record<string, string[]> = {};

  if (!existsSync(agentsDir)) return map;

  const entries = await readdir(agentsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const spec = await loadAgentConfig(projectHomeDir, entry.name);
      for (const toolId of spec.tools?.mcpServers || []) {
        if (!map[toolId]) map[toolId] = [];
        map[toolId].push(spec.name || entry.name);
      }
    } catch (error) {
      logger.debug('Failed to load agent for tool map', {
        agent: entry.name,
        error,
      });
    }
  }

  return map;
}

export async function agentConfigExists(
  projectHomeDir: string,
  slug: string,
): Promise<boolean> {
  return existsSync(join(projectHomeDir, 'agents', slug, 'agent.json'));
}

function deriveWorkflowLabel(filename: string): string {
  const name = basename(filename, extname(filename));
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function assertSafeAgentSpec(slug: string, spec: AgentSpec): void {
  if (typeof spec.prompt === 'string' && spec.prompt.length > 0) {
    assertSafeContextText(spec.prompt, {
      source: `agent '${slug}' prompt`,
    });
  }

  for (const quickPrompt of spec.ui?.quickPrompts || []) {
    if (
      typeof quickPrompt.prompt !== 'string' ||
      quickPrompt.prompt.length === 0
    ) {
      continue;
    }

    assertSafeContextText(quickPrompt.prompt, {
      source: `agent '${slug}' quick prompt '${quickPrompt.id}'`,
    });
  }
}

async function validateWorkflowShortcuts(
  projectHomeDir: string,
  slug: string,
  shortcuts?: string[],
): Promise<string[]> {
  if (!shortcuts || shortcuts.length === 0) {
    return [];
  }

  try {
    const workflows = await listAgentWorkflowMetadata(projectHomeDir, slug);
    const knownIds = new Set(workflows.map((workflow) => workflow.id));
    const missing = shortcuts.filter((id) => !knownIds.has(id));

    if (missing.length > 0) {
      logger.warn(
        'Agent references missing workflows in ui.workflowShortcuts',
        {
          agent: slug,
          missing: missing.join(', '),
        },
      );
    }

    return missing;
  } catch (error) {
    logger.error('Failed to validate workflow shortcuts', {
      agent: slug,
      error,
    });
    return shortcuts;
  }
}
