/**
 * Conversation Routes - conversation and message management
 */

import { Hono } from 'hono';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import type { ConfigLoader } from '../domain/config-loader.js';
import type { ConversationRecord } from '../domain/storage-adapter.js';
import type { AppConfig } from '../domain/types.js';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';
import * as ConversationManager from '../runtime/conversation-manager.js';
import { conversationOps } from '../telemetry/metrics.js';
import type { Logger } from '../utils/logger.js';
import {
  contextActionSchema,
  conversationUpdateSchema,
  errorMessage,
  getBody,
  param,
  validate,
} from './schemas.js';

export function createConversationRoutes(
  memoryAdapters: Map<string, FileMemoryAdapter>,
  logger: Logger,
  agentFixedTokens?: Map<
    string,
    { systemPromptTokens: number; mcpServerTokens: number }
  >,
  agentTools?: Map<string, unknown[]>,
  configLoader?: ConfigLoader,
  appConfig?: AppConfig,
  modelCatalog?: BedrockModelCatalog,
  createMemoryAdapter?: (slug: string) => FileMemoryAdapter,
) {
  const app = new Hono();

  /** Get or lazily create an adapter for a slug */
  const getAdapter = (slug: string): FileMemoryAdapter | null => {
    let adapter = memoryAdapters.get(slug);
    if (!adapter && createMemoryAdapter) {
      adapter = createMemoryAdapter(slug);
      memoryAdapters.set(slug, adapter);
    }
    return adapter || null;
  };

  // Get conversations for an agent
  app.get('/:slug/conversations', async (c) => {
    try {
      conversationOps.add(1, { operation: 'list' });
      const slug = param(c, 'slug');
      const adapter = getAdapter(slug);

      if (!adapter) {
        return c.json({ success: true, data: [] });
      }

      const conversations = await adapter.getConversations(slug);

      return c.json({ success: true, data: conversations });
    } catch (error: unknown) {
      logger.error('Failed to load conversations', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Update conversation (e.g., title)
  app.patch(
    '/:slug/conversations/:conversationId',
    validate(conversationUpdateSchema),
    async (c) => {
      try {
        conversationOps.add(1, {
          operation: 'update',
          agent: param(c, 'slug'),
        });
        const slug = param(c, 'slug');
        const conversationId = param(c, 'conversationId');
        const adapter = getAdapter(slug);

        if (!adapter) {
          return c.json({ success: false, error: 'Agent not found' }, 404);
        }

        const body = getBody(c);
        const updated = await adapter.updateConversation(conversationId, body);

        return c.json({ success: true, data: updated });
      } catch (error: unknown) {
        logger.error('Failed to update conversation', { error });
        return c.json({ success: false, error: errorMessage(error) }, 500);
      }
    },
  );

  // Delete conversation
  app.delete('/:slug/conversations/:conversationId', async (c) => {
    try {
      conversationOps.add(1, { operation: 'delete', agent: param(c, 'slug') });
      const slug = param(c, 'slug');
      const conversationId = param(c, 'conversationId');
      const adapter = getAdapter(slug);

      if (!adapter) {
        return c.json({ success: false, error: 'Agent not found' }, 404);
      }

      await adapter.deleteConversation(conversationId);

      return c.json({ success: true });
    } catch (error: unknown) {
      logger.error('Failed to delete conversation', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Get messages for a conversation
  app.get('/:slug/conversations/:conversationId/messages', async (c) => {
    try {
      conversationOps.add(1, {
        operation: 'messages',
        agent: param(c, 'slug'),
      });
      const slug = param(c, 'slug');
      const conversationId = param(c, 'conversationId');
      const adapter = getAdapter(slug);

      if (!adapter) {
        return c.json({ success: true, data: [] });
      }

      // Try with the standard userId format first, fall back to scanning
      let messages = await adapter.getMessages(`agent:${slug}`, conversationId);
      if (messages.length === 0) {
        // Conversation may have been created with a different userId (e.g. auth alias)
        // The adapter's findConversationLocation will scan all agent dirs
        const conversation = await adapter.getConversation(conversationId);
        if (conversation) {
          messages = await adapter.getMessages(
            conversation.userId,
            conversationId,
          );
        }
      }

      return c.json({ success: true, data: messages });
    } catch (error: unknown) {
      logger.error('Failed to load messages', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Manage conversation context (summarize, trim, etc.)
  app.post(
    '/:slug/conversations/:conversationId/context',
    validate(contextActionSchema),
    async (c) => {
      try {
        const slug = param(c, 'slug');
        const conversationId = param(c, 'conversationId');
        const { action, content } = getBody(c);
        const result = await ConversationManager.manageConversationContext(
          slug,
          conversationId,
          action,
          content,
          memoryAdapters,
        );
        return c.json(result);
      } catch (error: unknown) {
        logger.error('Failed to manage conversation context', { error });
        return c.json({ success: false, error: errorMessage(error) }, 500);
      }
    },
  );

  // Get conversation token/stats
  app.get('/:slug/conversations/:conversationId/stats', async (c) => {
    try {
      const slug = param(c, 'slug');
      const conversationId = param(c, 'conversationId');
      const data = await ConversationManager.getConversationStats(
        slug,
        conversationId,
        memoryAdapters,
        agentFixedTokens!,
        agentTools as any,
        configLoader as any,
        appConfig as any,
        modelCatalog,
        logger,
      );
      return c.json({ success: true, data });
    } catch (error: unknown) {
      logger.error('Failed to get conversation stats', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  return app;
}

/**
 * Global conversation lookup — resolves a conversation ID across all agents/projects.
 */
export function createGlobalConversationRoutes(
  memoryAdapters: Map<string, FileMemoryAdapter>,
  storageAdapter: { getConversation(id: string): ConversationRecord | null },
  logger: Logger,
  _createMemoryAdapter?: (slug: string) => FileMemoryAdapter,
) {
  const app = new Hono();

  app.get('/:id', async (c) => {
    try {
      const id = param(c, 'id');

      // Try project storage first (has projectId/projectSlug)
      const projectRecord = storageAdapter.getConversation(id);
      if (projectRecord) {
        return c.json({ success: true, data: projectRecord });
      }

      // Fall back to scanning memory adapters
      for (const [slug, adapter] of memoryAdapters) {
        const conv = await adapter.getConversation(id);
        if (conv) {
          return c.json({
            success: true,
            data: { id: conv.id, agentSlug: slug, title: conv.title },
          });
        }
      }

      return c.json({ success: false, error: 'Conversation not found' }, 404);
    } catch (error: unknown) {
      logger.error('Failed to lookup conversation', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  return app;
}
