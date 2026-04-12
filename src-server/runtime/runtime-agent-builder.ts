import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { AppConfig } from '@stallion-ai/contracts/config';
import { Agent, type Tool } from '@voltagent/core';
import { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';
import { ApprovalGuardianService } from '../services/approval-guardian.js';
import type { ApprovalRegistry } from '../services/approval-registry.js';
import type { SkillService } from '../services/skill-service.js';
import type { Logger } from '../utils/logger.js';
import { createAgentHooks } from './agent-hooks.js';
import type { AgentBundle, IAgentFramework } from './types.js';

interface RuntimeAgentBuilderContext {
  agentSlug: string;
  appConfig: AppConfig;
  configLoader: ConfigLoader;
  framework: IAgentFramework;
  skillService: SkillService;
  logger: Logger;
  modelCatalog?: BedrockModelCatalog;
  usageAggregator?: any;
  approvalRegistry: ApprovalRegistry;
  mcpConfigs: Map<string, any>;
  mcpConnectionStatus: Map<string, { connected: boolean; error?: string }>;
  integrationMetadata: Map<
    string,
    { type: string; transport?: string; toolCount?: number }
  >;
  toolNameMapping: Map<
    string,
    {
      original: string;
      normalized: string;
      server: string | null;
      tool: string;
    }
  >;
  toolNameReverseMapping: Map<string, string>;
  memoryAdapters: Map<string, FileMemoryAdapter>;
  agentFixedTokens: Map<
    string,
    { systemPromptTokens: number; mcpServerTokens: number }
  >;
  agentTools: Map<string, Tool<any>[]>;
  globalToolRegistry: Map<string, Tool<any>>;
  agentHooksMap: Map<string, ReturnType<typeof createAgentHooks>>;
  agentSpecs: Map<string, AgentSpec>;
  replaceTemplateVariables: (text: string, agentName?: string) => string;
}

export async function buildRuntimeAgentInstance(
  context: RuntimeAgentBuilderContext,
): Promise<Agent> {
  const spec = await context.configLoader.loadAgent(context.agentSlug);
  context.agentSpecs.set(context.agentSlug, spec);

  const instructions = createRuntimeInstructions(
    spec,
    context.appConfig,
    context.skillService,
    context.replaceTemplateVariables,
  );

  const memoryAdapter = new FileMemoryAdapter({
    projectHomeDir: context.configLoader.getProjectHomeDir(),
    usageAggregator: context.usageAggregator,
  });

  const hooks = createAgentHooks({
    spec,
    appConfig: context.appConfig,
    configLoader: context.configLoader,
    modelCatalog: context.modelCatalog,
    agentFixedTokens: context.agentFixedTokens,
    memoryAdapters: context.memoryAdapters,
    approvalRegistry: context.approvalRegistry,
    approvalGuardian: new ApprovalGuardianService({
      appConfig: context.appConfig,
      framework: context.framework,
      logger: context.logger,
      modelCatalog: context.modelCatalog,
      projectHomeDir: context.configLoader.getProjectHomeDir(),
    }),
    toolNameMapping: context.toolNameMapping,
    logger: context.logger,
  });

  const bundle = await context.framework.createAgent(
    context.agentSlug,
    spec,
    {
      appConfig: context.appConfig,
      projectHomeDir: context.configLoader.getProjectHomeDir(),
      usageAggregator: context.usageAggregator,
      modelCatalog: context.modelCatalog,
      approvalRegistry: context.approvalRegistry,
      hooks,
    },
    {
      processedPrompt: instructions,
      memoryAdapter,
      configLoader: context.configLoader,
      mcpConfigs: context.mcpConfigs,
      mcpConnectionStatus: context.mcpConnectionStatus,
      integrationMetadata: context.integrationMetadata,
      toolNameMapping: context.toolNameMapping,
      toolNameReverseMapping: context.toolNameReverseMapping,
      approvalRegistry: context.approvalRegistry,
      agentFixedTokens: context.agentFixedTokens,
      memoryAdapters: context.memoryAdapters,
      logger: context.logger,
    },
  );

  applyRuntimeAgentBundle(context.agentSlug, spec, bundle, hooks, context);

  context.logger.info('[Agent Initialized]', {
    agent: context.agentSlug,
    runtime: context.appConfig.runtime || 'voltagent',
    ...bundle.fixedTokens,
    totalFixedTokens:
      bundle.fixedTokens.systemPromptTokens +
      bundle.fixedTokens.mcpServerTokens,
  });

  return (bundle.agent as any).raw || bundle.agent;
}

function createRuntimeInstructions(
  spec: AgentSpec,
  appConfig: AppConfig,
  skillService: SkillService,
  replaceTemplateVariables: (text: string, agentName?: string) => string,
): () => string {
  const rawSystemPrompt = appConfig.systemPrompt || '';
  const rawAgentPrompt = spec.prompt;
  const skillCatalog = skillService.getSkillCatalogPrompt(spec.skills);

  return () => {
    const parts = [
      rawSystemPrompt ? replaceTemplateVariables(rawSystemPrompt) : '',
      replaceTemplateVariables(rawAgentPrompt),
      skillCatalog,
    ].filter(Boolean);
    return parts.join('\n\n');
  };
}

function applyRuntimeAgentBundle(
  agentSlug: string,
  spec: AgentSpec,
  bundle: AgentBundle,
  hooks: ReturnType<typeof createAgentHooks>,
  context: RuntimeAgentBuilderContext,
): void {
  context.memoryAdapters.set(agentSlug, bundle.memoryAdapter);
  const agentTools = bundle.tools as Tool<any>[];

  const skillTool = context.skillService.getSkillTool(spec.skills);
  if (skillTool) {
    agentTools.push(skillTool as Tool<any>);
  }

  context.agentTools.set(agentSlug, agentTools);
  context.agentFixedTokens.set(agentSlug, bundle.fixedTokens);
  context.agentHooksMap.set(agentSlug, hooks);

  for (const tool of agentTools) {
    if (!context.globalToolRegistry.has(tool.name)) {
      context.globalToolRegistry.set(tool.name, tool as Tool<any>);
    }
  }
}
