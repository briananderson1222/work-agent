import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { Tool } from '@voltagent/core';

interface RuntimeVoiceAgentConfigLoader {
  agentExists(slug: string): Promise<boolean>;
  updateAgent(slug: string, spec: {
    name: string;
    prompt: string;
    tools: {
      mcpServers: string[];
      autoApprove: string[];
      available: string[];
    };
  }): Promise<unknown>;
  createAgent(spec: {
    name: string;
    prompt: string;
    tools: {
      mcpServers: string[];
      autoApprove: string[];
      available: string[];
    };
  }): Promise<unknown>;
}

interface RuntimeVoiceLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
}

interface RuntimeVoiceBootstrapContext {
  agentSpecs: Iterable<AgentSpec>;
  configLoader: RuntimeVoiceAgentConfigLoader;
  createVoltAgentInstance: (slug: string) => Promise<unknown>;
  agentTools: Map<string, Tool<any>[]>;
  logger: RuntimeVoiceLogger;
}

const STALLION_VOICE_PROMPT =
  'You are Stallion Voice, a hands-free voice assistant. You can navigate the app, query data, and perform actions. Be concise — this is voice, not text. Use short sentences. Always confirm before creating, modifying, or deleting anything.';

export function createRuntimeVoiceAgentSpec(agentSpecs: Iterable<AgentSpec>) {
  const mcpServers = Array.from(
    new Set([
      'stallion-control',
      ...Array.from(agentSpecs).flatMap((spec) => spec.tools?.mcpServers ?? []),
    ]),
  );

  return {
    name: 'Stallion Voice',
    prompt: STALLION_VOICE_PROMPT,
    tools: {
      mcpServers,
      autoApprove: ['stallion-control_*'],
      available: ['*'],
    },
  };
}

export async function bootstrapRuntimeVoiceAgent(
  context: RuntimeVoiceBootstrapContext,
): Promise<void> {
  const voiceSpec = createRuntimeVoiceAgentSpec(context.agentSpecs);

  if (await context.configLoader.agentExists('stallion-voice')) {
    await context.configLoader.updateAgent('stallion-voice', voiceSpec);
  } else {
    await context.configLoader.createAgent(voiceSpec);
  }

  try {
    await context.createVoltAgentInstance('stallion-voice');
    context.logger.info('Bootstrapped stallion-voice agent', {
      mcpServers: voiceSpec.tools.mcpServers,
      toolCount: context.agentTools.get('stallion-voice')?.length ?? 0,
    });
  } catch (error) {
    context.logger.warn('Failed to load stallion-voice tools', { error });
    context.logger.info('Bootstrapped stallion-voice agent (no tools)', {
      mcpServers: voiceSpec.tools.mcpServers,
    });
  }
}
