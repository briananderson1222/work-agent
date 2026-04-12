import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { AppConfig } from '@stallion-ai/contracts/config';
import type {
  GuidanceAgentExport,
  PortabilityImportLedgerEntry,
} from '@stallion-ai/contracts/portability';
import type { ToolDef } from '@stallion-ai/contracts/tool';
import { PROJECT_HOME } from './helpers.js';

export interface PortabilitySnapshot {
  appConfig: AppConfig;
  agents: GuidanceAgentExport[];
  integrations: ToolDef[];
}

export function readPortabilitySnapshot(
  projectHome = PROJECT_HOME,
): PortabilitySnapshot {
  return {
    appConfig: readAppConfig(projectHome),
    agents: listAgents(projectHome),
    integrations: listIntegrations(projectHome),
  };
}

export function readAppConfig(projectHome = PROJECT_HOME): AppConfig {
  const path = join(projectHome, 'config', 'app.json');
  if (!existsSync(path)) return {} as AppConfig;
  return JSON.parse(readFileSync(path, 'utf-8')) as AppConfig;
}

export function writeAppConfigGuidance(
  guidance: Partial<AppConfig>,
  projectHome = PROJECT_HOME,
): AppConfig {
  const next = {
    ...readAppConfig(projectHome),
    ...guidance,
  };
  mkdirSync(join(projectHome, 'config'), { recursive: true });
  writeFileSync(
    join(projectHome, 'config', 'app.json'),
    JSON.stringify(next, null, 2),
    'utf-8',
  );
  return next;
}

export function listAgents(projectHome = PROJECT_HOME): GuidanceAgentExport[] {
  if (!existsSync(AGENTS_DIR_FOR(projectHome))) return [];

  return readdirSync(AGENTS_DIR_FOR(projectHome), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      slug: entry.name,
      spec: readAgent(entry.name, projectHome),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function readAgent(slug: string, projectHome = PROJECT_HOME): AgentSpec {
  return JSON.parse(
    readFileSync(
      join(AGENTS_DIR_FOR(projectHome), slug, 'agent.json'),
      'utf-8',
    ),
  ) as AgentSpec;
}

export function writeAgent(
  slug: string,
  spec: AgentSpec,
  projectHome = PROJECT_HOME,
): void {
  const agentDir = join(AGENTS_DIR_FOR(projectHome), slug);
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(
    join(agentDir, 'agent.json'),
    JSON.stringify(spec, null, 2),
    'utf-8',
  );
}

export function listIntegrations(projectHome = PROJECT_HOME): ToolDef[] {
  const integrationsDir = join(projectHome, 'integrations');
  if (!existsSync(integrationsDir)) return [];

  return readdirSync(integrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      JSON.parse(
        readFileSync(
          join(integrationsDir, entry.name, 'integration.json'),
          'utf-8',
        ),
      ),
    )
    .sort((a, b) => a.id.localeCompare(b.id)) as ToolDef[];
}

export function writeIntegration(
  id: string,
  def: ToolDef,
  projectHome = PROJECT_HOME,
): void {
  const dir = join(projectHome, 'integrations', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'integration.json'),
    JSON.stringify(def, null, 2),
    'utf-8',
  );
}

export function writeImportLedger(
  entry: PortabilityImportLedgerEntry,
  notes: string | null,
  projectHome = PROJECT_HOME,
): { ledgerPath: string; notesPath?: string } {
  const importsDir = join(projectHome, 'imports');
  mkdirSync(importsDir, { recursive: true });

  let notesPath: string | undefined;
  if (notes) {
    notesPath = join(importsDir, `${entry.id}.notes.md`);
    writeFileSync(notesPath, notes, 'utf-8');
  }

  const fullEntry = {
    ...entry,
    notesPath,
  };
  const ledgerPath = join(importsDir, `${entry.id}.json`);
  writeFileSync(ledgerPath, JSON.stringify(fullEntry, null, 2), 'utf-8');
  return { ledgerPath, notesPath };
}

function AGENTS_DIR_FOR(projectHome: string): string {
  return join(projectHome, 'agents');
}
