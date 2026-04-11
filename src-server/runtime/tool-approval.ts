import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { Tool } from '@voltagent/core';
import type { ApprovalRegistry } from '../services/approval-registry.js';

interface ToolWithDescription extends Omit<Tool<any>, 'description'> {
  description?: string;
}

export function isAutoApproved(toolName: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern === '*') return true;
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`).test(toolName);
  });
}

export function wrapToolWithElicitation(
  tool: Tool<any>,
  spec: AgentSpec,
  _toolNameMapping: Map<
    string,
    {
      original: string;
      normalized: string;
      server: string | null;
      tool: string;
    }
  >,
  _approvalRegistry: ApprovalRegistry,
  logger: any,
): Tool<any> {
  if (!spec?.tools) return tool;

  const autoApprove = spec.tools.autoApprove || [];
  const isAutoApprovedTool = autoApprove.some((pattern) => {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      return tool.name.startsWith(pattern.slice(0, -1));
    }
    return tool.name === pattern;
  });

  if (isAutoApprovedTool) {
    logger.debug('[Wrapper] Tool auto-approved, skipping wrapper', {
      toolName: tool.name,
    });
    return tool;
  }

  logger.debug('[Wrapper] Wrapping tool with elicitation', {
    toolName: tool.name,
  });

  const originalExecute = tool.execute;
  if (!originalExecute) return tool;

  return {
    ...tool,
    execute: async (args: any, options: any) => {
      const elicitation = options?.elicitation;

      logger.debug('[Wrapper] Tool execute called, requesting approval', {
        toolName: tool.name,
        hasElicitation: !!elicitation,
      });

      if (elicitation) {
        logger.debug('[Wrapper] Calling elicitation for approval', {
          toolName: tool.name,
        });

        const approved = await elicitation({
          type: 'tool-approval',
          toolName: tool.name,
          toolDescription: (tool as ToolWithDescription).description || '',
          toolArgs: args,
        });

        logger.info('[Wrapper] Tool approval decision', {
          toolName: tool.name,
          approved,
          reason: approved ? 'user_approved' : 'user_denied',
        });

        if (!approved) {
          return {
            success: false,
            error: 'USER_DENIED',
            message:
              'I requested permission to use this tool, but the user explicitly denied the request. I should ask what I should do differently.',
          };
        }
      } else {
        logger.info('[Wrapper] Tool auto-approved (no elicitation available)', {
          toolName: tool.name,
        });
      }

      return originalExecute(args, options);
    },
  };
}
