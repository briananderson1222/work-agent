/**
 * Conversation management functions
 * Handles conversation CRUD, stats, and message history
 */

import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { AppConfig } from '../domain/types.js';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';

// Type extensions for conversation manager
interface ConversationMetadata {
  stats?: ConversationStats;
  modelStats?: Record<string, any>;
}

interface ConversationStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextTokens?: number;
  turns: number;
  toolCalls: number;
  estimatedCost: number;
  tokenBreakdown?: {
    userMessageTokens?: number;
    assistantMessageTokens?: number;
    systemPromptTokens?: number;
    mcpServerTokens?: number;
  };
}

interface ConversationWithMetadata {
  metadata?: ConversationMetadata;
  userId: string;
}

interface UserMessage {
  id: string;
  role: 'user';
  parts: Array<{ type: 'text'; text: string }>;
}

/**
 * Extract userId from conversationId format: agent:<slug>:user:<id>:timestamp:random
 */
export function extractUserId(conversationId: string): string | null {
  const match = conversationId.match(/^agent:[^:]+:user:([^:]+):/);
  return match ? match[1] : null;
}

/**
 * Get conversation statistics for an agent and conversation
 */
export async function getConversationStats(
  slug: string,
  conversationId: string | undefined,
  memoryAdapters: Map<string, FileMemoryAdapter>,
  _agentFixedTokens: Map<
    string,
    { systemPromptTokens: number; mcpServerTokens: number }
  >,
  agentTools: Map<string, any[]>,
  configLoader: ConfigLoader,
  appConfig: AppConfig,
  _modelCatalog: BedrockModelCatalog | undefined,
  _logger: any,
) {
  if (!slug || slug === 'undefined') {
    throw new Error('Invalid agent slug');
  }

  const spec = await configLoader.loadAgent(slug);
  const modelId = spec.model || appConfig.defaultModel;

  // Calculate base stats from system prompt and tools
  const systemPromptTokens = Math.ceil((spec.prompt?.length || 0) / 4);
  const agentToolsList = agentTools.get(slug) || [];
  const toolsJson = JSON.stringify(
    agentToolsList.map((t: any) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  );
  const mcpServerTokens = Math.ceil(toolsJson.length / 4);

  // If no conversationId or conversation doesn't exist, return agent-level stats
  if (!conversationId) {
    const contextTokens = systemPromptTokens + mcpServerTokens;
    const contextWindowPercentage = calculateContextWindowPercentage(
      modelId,
      contextTokens,
    );

    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      contextTokens,
      turns: 0,
      toolCalls: 0,
      estimatedCost: 0,
      contextWindowPercentage,
      modelId,
      systemPromptTokens,
      mcpServerTokens,
      userMessageTokens: 0,
      assistantMessageTokens: 0,
      contextFilesTokens: 0,
    };
  }

  const adapter = memoryAdapters.get(slug);

  if (!adapter) {
    const contextTokens = systemPromptTokens + mcpServerTokens;
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      contextTokens,
      turns: 0,
      toolCalls: 0,
      estimatedCost: 0,
      contextWindowPercentage: calculateContextWindowPercentage(
        modelId,
        contextTokens,
      ),
      modelId,
      systemPromptTokens,
      mcpServerTokens,
      userMessageTokens: 0,
      assistantMessageTokens: 0,
      contextFilesTokens: 0,
    };
  }

  const conversation = await adapter.getConversation(conversationId);

  if (!conversation) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      contextTokens: systemPromptTokens + mcpServerTokens,
      turns: 0,
      toolCalls: 0,
      estimatedCost: 0,
      contextWindowPercentage: calculateContextWindowPercentage(
        modelId,
        systemPromptTokens + mcpServerTokens,
      ),
      modelId,
      systemPromptTokens,
      mcpServerTokens,
      userMessageTokens: 0,
      assistantMessageTokens: 0,
      contextFilesTokens: 0,
      notFound: true,
    };
  }

  interface ConversationStats {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    contextTokens?: number;
    turns: number;
    toolCalls: number;
    estimatedCost: number;
    tokenBreakdown?: {
      userMessageTokens?: number;
      assistantMessageTokens?: number;
      systemPromptTokens?: number;
      mcpServerTokens?: number;
    };
  }

  const stats: ConversationStats = (conversation as ConversationWithMetadata)
    .metadata?.stats || {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    turns: 0,
    toolCalls: 0,
    estimatedCost: 0,
  };

  const modelStats =
    (conversation as ConversationWithMetadata).metadata?.modelStats || {};

  const contextWindowPercentage = calculateContextWindowPercentage(
    modelId,
    stats.contextTokens || stats.totalTokens,
  );

  // Get token breakdown from stats or calculate on-the-fly
  const breakdown = stats.tokenBreakdown || {};
  let userMessageTokens = breakdown.userMessageTokens;
  let assistantMessageTokens = breakdown.assistantMessageTokens;

  // If breakdown doesn't exist, calculate user message tokens from conversation
  // Note: messages are stored separately, not on conversation object
  if (userMessageTokens === undefined) {
    const messages = await adapter.getMessages(
      conversation.userId,
      conversationId,
    );
    const userMessages = messages?.filter((m: any) => m.role === 'user') || [];
    userMessageTokens = userMessages.reduce((sum: number, m: any) => {
      const content =
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map((p: any) => p.text || '').join('')
            : '';
      return sum + Math.ceil(content.length / 4);
    }, 0);
  }

  // If assistant tokens not in breakdown, use outputTokens
  if (assistantMessageTokens === undefined) {
    assistantMessageTokens = stats.outputTokens || 0;
  }

  return {
    ...stats,
    contextWindowPercentage,
    conversationId,
    modelId,
    modelStats,
    systemPromptTokens,
    mcpServerTokens,
    userMessageTokens,
    assistantMessageTokens,
    contextFilesTokens: 0, // Placeholder for future context files support
  };
}

/**
 * Calculate context window usage percentage
 * Note: Context window size is not available via API, using 200k default
 */
function calculateContextWindowPercentage(
  _modelId: string,
  totalTokens: number,
): number {
  const maxTokens = 200000; // Default context window
  return Math.round((totalTokens / maxTokens) * 100 * 100) / 100;
}

/**
 * Manage conversation context (add system messages, clear history)
 */
export async function manageConversationContext(
  slug: string,
  conversationId: string,
  action: string,
  content: string | undefined,
  memoryAdapters: Map<string, FileMemoryAdapter>,
) {
  const adapter = memoryAdapters.get(slug);

  if (!adapter) {
    throw new Error('Agent not found');
  }

  switch (action) {
    case 'add-system-message':
      if (!content) {
        throw new Error('content is required for add-system-message');
      }

      // Inject as user message with special prefix for UI treatment
      await adapter.addMessage(
        {
          id: crypto.randomUUID(),
          role: 'user',
          parts: [{ type: 'text', text: `[SYSTEM_EVENT] ${content}` }],
        } as UserMessage,
        `agent:${slug}`,
        conversationId,
      );

      return { success: true, message: 'System event added' };

    case 'clear-history':
      await adapter.clearMessages(`agent:${slug}`, conversationId);
      return { success: true, message: 'Conversation history cleared' };

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
