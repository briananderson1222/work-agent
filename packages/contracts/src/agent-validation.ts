import type { AgentSpec } from './agent';

export function requiresAgentPromptForRuntime(
  runtimeConnectionId?: string | null,
): boolean {
  return !runtimeConnectionId || runtimeConnectionId === 'bedrock-runtime';
}

export function requiresAgentPrompt(
  spec: Pick<AgentSpec, 'execution'>,
): boolean {
  return requiresAgentPromptForRuntime(spec.execution?.runtimeConnectionId);
}
