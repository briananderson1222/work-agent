/**
 * Conversation management functions
 * Handles conversation CRUD, stats, and message history
 */

import type { AppConfig } from '@stallion-ai/contracts/config';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';
import {
  buildConversationStatsView,
  buildEmptyConversationStatsView,
  resolveConversationUserMessageTokens,
  type ConversationStats,
} from './conversation-stats-view.js';

// Type extensions for conversation manager
interface ConversationMetadata {
  stats?: ConversationStats;
  modelStats?: Record<string, any>;
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

  let spec: any;
  try {
    spec = await configLoader.loadAgent(slug);
  } catch (e) {
    console.debug('Failed to load agent spec, using defaults:', e);
    // Default/temp agents don't have agent.json on disk — use minimal defaults
    spec = { prompt: '', model: appConfig.defaultModel };
  }
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
    return buildEmptyConversationStatsView({
      modelId,
      systemPromptTokens,
      mcpServerTokens,
    });
  }

  const adapter = memoryAdapters.get(slug);

  if (!adapter) {
    return buildEmptyConversationStatsView({
      modelId,
      systemPromptTokens,
      mcpServerTokens,
    });
  }

  const conversation = await adapter.getConversation(conversationId);

  if (!conversation) {
    return buildEmptyConversationStatsView({
      modelId,
      systemPromptTokens,
      mcpServerTokens,
      notFound: true,
    });
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

  // Get token breakdown from stats or calculate on-the-fly
  const breakdown = stats.tokenBreakdown || {};
  let userMessageTokens = breakdown.userMessageTokens;
  const assistantMessageTokens = breakdown.assistantMessageTokens;

  // If breakdown doesn't exist, calculate user message tokens from conversation
  // Note: messages are stored separately, not on conversation object
  if (userMessageTokens === undefined) {
    const messages = await adapter.getMessages(
      conversation.userId,
      conversationId,
    );
    userMessageTokens = resolveConversationUserMessageTokens(messages);
  }

  return buildConversationStatsView({
    stats,
    conversationId,
    modelId,
    modelStats,
    systemPromptTokens,
    mcpServerTokens,
    userMessageTokens,
    assistantMessageTokens,
  });
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
