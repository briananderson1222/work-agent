import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import type { ToolDef } from '@stallion-ai/contracts/tool';
import type { AgentSpec, LayoutDefinition } from './types.js';

export function readPluginManifest(dir: string): PluginManifest {
  const path = join(dir, 'plugin.json');
  if (!existsSync(path)) throw new Error(`plugin.json not found in ${dir}`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function readIntegrationDef(toolsDir: string, id: string): ToolDef {
  const path = join(toolsDir, id, 'integration.json');
  if (!existsSync(path)) {
    throw new Error(`Integration '${id}' not found at ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function readAgentSpec(path: string): AgentSpec {
  if (!existsSync(path)) throw new Error(`Agent spec not found at ${path}`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function readLayoutConfig(path: string): LayoutDefinition {
  if (!existsSync(path)) throw new Error(`Layout config not found at ${path}`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function resolvePluginIntegrations(
  pluginDir: string,
  toolsDir: string,
): Map<string, ToolDef> {
  const manifest = readPluginManifest(pluginDir);
  const tools = new Map<string, ToolDef>();
  for (const agentRef of manifest.agents || []) {
    const agentPath = join(pluginDir, agentRef.source);
    if (!existsSync(agentPath)) continue;
    const agent = readAgentSpec(agentPath);
    for (const serverId of agent.tools?.mcpServers || []) {
      if (tools.has(serverId)) continue;
      try {
        tools.set(serverId, readIntegrationDef(toolsDir, serverId));
      } catch {}
    }
  }
  return tools;
}

export function listIntegrationIds(toolsDir: string): string[] {
  if (!existsSync(toolsDir)) return [];
  return readdirSync(toolsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(toolsDir, entry.name, 'integration.json')),
    )
    .map((entry) => entry.name);
}

/**
 * Copy bundled tool configs from a plugin's tools/ directory to the project tools dir.
 * Returns the list of tool IDs that were copied.
 */
export function copyPluginIntegrations(
  pluginDir: string,
  projectIntegrationsDir: string,
): string[] {
  const pluginIntegrationsDir = join(pluginDir, 'integrations');
  if (!existsSync(pluginIntegrationsDir)) return [];
  mkdirSync(projectIntegrationsDir, { recursive: true });

  let pluginName = '';
  try {
    pluginName = JSON.parse(
      readFileSync(join(pluginDir, 'plugin.json'), 'utf-8'),
    ).name;
  } catch {}

  const copied: string[] = [];
  for (const entry of readdirSync(pluginIntegrationsDir, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const target = join(projectIntegrationsDir, entry.name);
    if (!existsSync(target)) {
      cpSync(join(pluginIntegrationsDir, entry.name), target, {
        recursive: true,
      });
      if (pluginName) {
        const definitionPath = join(target, 'integration.json');
        if (existsSync(definitionPath)) {
          try {
            const definition = JSON.parse(
              readFileSync(definitionPath, 'utf-8'),
            );
            definition.plugin = pluginName;
            writeFileSync(definitionPath, JSON.stringify(definition, null, 2));
          } catch {}
        }
      }
      copied.push(entry.name);
    }
  }
  return copied;
}
