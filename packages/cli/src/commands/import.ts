import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  buildAgentsMdImportPlan,
  parseAgentsMd,
  parseClaudeDesktopConfig,
} from '@stallion-ai/shared/portability';
import {
  writeAgent,
  writeAppConfigGuidance,
  writeImportLedger,
  writeIntegration,
} from './portability-io.js';

export interface ImportCommandOptions {
  projectHome?: string;
}

export interface ImportCommandResult {
  appConfigUpdated: boolean;
  agentCount: number;
  integrationCount: number;
  ledgerPath: string;
  notesPath?: string;
}

export function importConfig(
  sourcePath: string,
  options: ImportCommandOptions = {},
): ImportCommandResult {
  if (!sourcePath) {
    throw new Error('Usage: stallion import <file>');
  }

  const sourceText = readFileSync(sourcePath, 'utf-8');
  if (sourcePath.toLowerCase().endsWith('.json')) {
    const { integrations, losses } = parseClaudeDesktopConfig(sourceText);
    for (const integration of integrations) {
      writeIntegration(integration.id, integration, options.projectHome);
    }
    const { ledgerPath } = writeImportLedger(
      {
        id: `claude-desktop-${Date.now()}`,
        sourceFormat: 'claude-desktop',
        importedAt: new Date().toISOString(),
        sourcePath,
        degradedFields: losses,
        applied: {
          appConfigUpdated: false,
          agentSlugs: [],
          integrationIds: integrations.map((integration) => integration.id),
        },
      },
      null,
      options.projectHome,
    );
    console.log(
      `  ✓ imported ${basename(sourcePath)} (0 agents, ${integrations.length} integrations)`,
    );
    return {
      appConfigUpdated: false,
      agentCount: 0,
      integrationCount: integrations.length,
      ledgerPath,
    };
  }

  const parsed = parseAgentsMd(sourceText);
  const importedAt = new Date().toISOString();
  const plan = buildAgentsMdImportPlan({
    sourcePath,
    parsed,
    importedAt,
  });
  const notes = parsed.unmatchedProse;

  if (Object.keys(plan.appConfig).length > 0) {
    writeAppConfigGuidance(plan.appConfig, options.projectHome);
  }

  for (const agent of plan.agents) {
    writeAgent(agent.slug, agent.spec, options.projectHome);
  }

  for (const integration of plan.integrations) {
    writeIntegration(integration.id, integration, options.projectHome);
  }

  const { ledgerPath } = writeImportLedger(
    plan.ledgerEntry,
    notes,
    options.projectHome,
  );
  const notesPath = notes
    ? ledgerPath.replace(/\.json$/, '.notes.md')
    : undefined;

  console.log(
    `  ✓ imported ${basename(sourcePath)} (${plan.agents.length} agents, ${plan.integrations.length} integrations)`,
  );

  return {
    appConfigUpdated: plan.ledgerEntry.applied.appConfigUpdated,
    agentCount: plan.agents.length,
    integrationCount: plan.integrations.length,
    ledgerPath,
    notesPath,
  };
}
