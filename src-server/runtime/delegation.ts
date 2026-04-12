import type {
  AgentDelegationContext,
  AgentDelegationPolicy,
  AgentSpec,
} from '@stallion-ai/contracts/agent';
import {
  type MCPToolNameMappingEntry,
  matchesToolPattern,
} from './mcp-tool-names.js';

export const DEFAULT_DELEGATION_MAX_DEPTH = 2;

export const DEFAULT_CHILD_BLOCKED_TOOLS = [
  'stallion-control_send_message',
  'stallion-control_add_*',
  'stallion-control_create_*',
  'stallion-control_delete_*',
  'stallion-control_run_job',
  'stallion-control_update_*',
];

export function resolveDelegationPolicy(
  spec?: AgentSpec | null,
): Required<AgentDelegationPolicy> {
  return {
    maxDepth: spec?.delegation?.maxDepth ?? DEFAULT_DELEGATION_MAX_DEPTH,
    allowedTools: [...(spec?.delegation?.allowedTools ?? [])],
    blockedTools: [
      ...DEFAULT_CHILD_BLOCKED_TOOLS,
      ...(spec?.delegation?.blockedTools ?? []),
    ],
    denyApprovals: spec?.delegation?.denyApprovals ?? true,
  };
}

export function createChildDelegationContext(options: {
  agentSlug: string;
  conversationId?: string;
  spec?: AgentSpec | null;
  current?: AgentDelegationContext;
}): AgentDelegationContext {
  const policy = resolveDelegationPolicy(options.spec);
  const currentDepth = options.current?.depth ?? 0;
  if (currentDepth >= policy.maxDepth) {
    throw new Error(
      `Delegation depth limit reached (${policy.maxDepth}). Start a fresh top-level conversation to delegate again.`,
    );
  }

  return {
    mode: 'isolated-child',
    depth: currentDepth + 1,
    maxDepth: policy.maxDepth,
    parentAgentSlug: options.agentSlug,
    parentConversationId: options.conversationId,
    rootAgentSlug: options.current?.rootAgentSlug ?? options.agentSlug,
    rootConversationId:
      options.current?.rootConversationId ?? options.conversationId,
    ...(policy.allowedTools.length > 0
      ? { allowedTools: policy.allowedTools }
      : {}),
    ...(policy.blockedTools.length > 0
      ? { blockedTools: policy.blockedTools }
      : {}),
    ...(policy.denyApprovals ? { denyApprovals: true } : {}),
  };
}

export function isDelegatedToolAllowed(options: {
  toolName: string;
  delegation?: AgentDelegationContext;
  toolNameMapping: Map<string, MCPToolNameMappingEntry>;
}): boolean {
  const delegation = options.delegation;
  if (!delegation) {
    return true;
  }

  if (
    delegation.allowedTools?.length &&
    !matchesToolPattern(
      options.toolName,
      delegation.allowedTools,
      options.toolNameMapping,
    )
  ) {
    return false;
  }

  if (
    delegation.blockedTools?.length &&
    matchesToolPattern(
      options.toolName,
      delegation.blockedTools,
      options.toolNameMapping,
    )
  ) {
    return false;
  }

  return true;
}
