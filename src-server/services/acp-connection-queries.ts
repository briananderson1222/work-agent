import type { ClientSideConnection } from '@agentclientprotocol/sdk';
import type { ACPConnectionConfig } from '@stallion-ai/contracts/acp';
import {
  getACPConnectionStatusView,
  getACPConnectionVirtualAgents,
  getACPCurrentModelName,
  hasACPConnectionAgent,
} from './acp-connection-view.js';
import type { ACPMode, ACPSlashCommand } from './acp-bridge-types.js';
import type { ACPConnectionStatus } from './acp-connection.js';

interface ACPConfigOption {
  category?: string;
  currentValue?: string;
  options?: Array<{ name?: string; value?: string }>;
}

export interface ACPConnectionStatusView {
  status: ACPConnectionStatus;
  modes: string[];
  sessionId: string | null;
  mcpServers: string[];
  configOptions: ACPConfigOption[];
  currentModel: string | null;
  interactive?: { args: string[] };
}

export function getACPConnectionStatus({
  status,
  modes,
  sessionId,
  mcpServers,
  configOptions,
  detectedModel,
  interactive,
}: {
  status: ACPConnectionStatus;
  modes: ACPMode[];
  sessionId: string | null;
  mcpServers: string[];
  configOptions: ACPConfigOption[];
  detectedModel: string | null;
  interactive?: { args: string[] };
}): ACPConnectionStatusView {
  return getACPConnectionStatusView({
    status,
    modes,
    sessionId,
    mcpServers,
    configOptions,
    currentModel: getACPCurrentModelName(configOptions, detectedModel),
    interactive,
  });
}

export function getACPConnectionVirtualAgentViews({
  modes,
  prefix,
  config,
  configOptions,
  promptCapabilities,
  detectedModel,
}: {
  modes: ACPMode[];
  prefix: string;
  config: ACPConnectionConfig;
  configOptions: ACPConfigOption[];
  promptCapabilities: { image?: boolean; audio?: boolean; embeddedContext?: boolean };
  detectedModel: string | null;
}): any[] {
  return getACPConnectionVirtualAgents({
    modes,
    prefix,
    config,
    configOptions,
    promptCapabilities,
    currentModelName: getACPCurrentModelName(configOptions, detectedModel),
  });
}

export function getACPConnectionSlashCommands({
  slug,
  prefix,
  modes,
  slashCommands,
}: {
  slug: string;
  prefix: string;
  modes: ACPMode[];
  slashCommands: ACPSlashCommand[];
}): ACPSlashCommand[] {
  if (!hasACPConnectionAgent(modes, prefix, slug)) {
    return [];
  }
  return slashCommands;
}

export async function getACPConnectionCommandOptions({
  connection,
  sessionId,
  partialCommand,
  logger,
  timeoutMs = 3000,
}: {
  connection: ClientSideConnection | null;
  sessionId: string | null;
  partialCommand: string;
  logger: { debug: (message: string, meta?: unknown) => void };
  timeoutMs?: number;
}): Promise<any[]> {
  if (!connection || !sessionId) {
    return [];
  }

  try {
    const result = await Promise.race([
      connection.extMethod('_kiro.dev/commands/options', {
        sessionId,
        partialCommand,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs),
      ),
    ]);
    return (result as any)?.options || [];
  } catch (error) {
    logger.debug('Failed to get command options', { error });
    return [];
  }
}
