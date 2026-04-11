import { join } from 'node:path';
import type { AgentSpec } from '@stallion-ai/contracts/agent';
import { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { AppConfig } from '@stallion-ai/contracts/config';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { Logger } from '../utils/logger.js';
import type { UsageAggregator } from '../analytics/usage-aggregator.js';
import type { IAgentFramework } from './types.js';

interface RuntimeDefaultAgentContext {
  appConfig: AppConfig;
  configLoader: ConfigLoader;
  framework: IAgentFramework;
  logger: Logger;
  usageAggregator?: UsageAggregator;
  port: number;
  defaultSystemPrompt: string;
  autoApproveTools: string[];
  replaceTemplateVariables: (text: string) => string;
  createBedrockModel: (spec: AgentSpec) => Promise<any>;
  loadAgentTools: (slug: string, spec: AgentSpec) => Promise<any[]>;
  activeAgents: Map<string, any>;
  agentTools: Map<string, any[]>;
  memoryAdapters: Map<string, FileMemoryAdapter>;
  agentMetadataMap: Map<string, any>;
}

export function createRuntimeSelfIntegration(port: number) {
  const selfIntegrationId = 'stallion-control';
  const selfServerPath = join(
    import.meta.dirname || process.cwd(),
    'stallion-control.js',
  );

  return {
    selfIntegrationId,
    selfIntegration: {
      id: selfIntegrationId,
      displayName: 'Stallion Control',
      description:
        'Manage agents, skills, integrations, prompts, and jobs via natural language',
      kind: 'mcp' as const,
      transport: 'stdio' as const,
      command: 'node',
      args: [selfServerPath],
      env: {
        STALLION_API_BASE: `http://127.0.0.1:${port}`,
        STALLION_PORT: String(port),
      },
    },
  };
}

export async function bootstrapRuntimeDefaultAgent(
  context: RuntimeDefaultAgentContext,
): Promise<Record<string, any>> {
  const { selfIntegrationId, selfIntegration } = createRuntimeSelfIntegration(
    context.port,
  );
  await context.configLoader.saveIntegration(selfIntegrationId, selfIntegration);

  const defaultSpec = {
    model: context.appConfig.defaultModel,
    tools: {
      mcpServers: [selfIntegrationId],
      autoApprove: context.autoApproveTools,
    },
  } as AgentSpec;

  const defaultModel = await context.createBedrockModel(defaultSpec);
  let defaultTools: any[] = [];

  try {
    defaultTools = await context.loadAgentTools('default', defaultSpec);
    context.logger.info('Default agent tools loaded', {
      count: defaultTools.length,
    });
  } catch (error) {
    context.logger.warn(
      'Failed to load stallion-control tools for default agent',
      { error },
    );
  }

  const defaultAgent = await context.framework.createTempAgent({
    name: 'default',
    instructions: () =>
      context.replaceTemplateVariables(context.appConfig.systemPrompt || context.defaultSystemPrompt),
    model: defaultModel,
    tools: defaultTools,
  });

  context.activeAgents.set('default', defaultAgent as any);
  context.agentTools.set('default', defaultTools);
  context.memoryAdapters.set(
    'default',
    new FileMemoryAdapter({
      projectHomeDir: context.configLoader.getProjectHomeDir(),
      usageAggregator: context.usageAggregator,
    }),
  );
  context.agentMetadataMap.set('default', {
    slug: 'default',
    name: 'Stallion',
    description: 'Default agent with full access to manage Stallion',
    updatedAt: new Date().toISOString(),
  });
  context.logger.info('Default agent created', {
    model: context.appConfig.defaultModel,
  });

  return { default: defaultAgent as any };
}
