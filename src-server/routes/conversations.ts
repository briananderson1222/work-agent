/**
 * Conversation Routes - conversation and message management
 */

import { Hono } from 'hono';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import * as ConversationManager from '../runtime/conversation-manager.js';
import { conversationOps } from '../telemetry/metrics.js';
import { contextActionSchema, validate, getBody, param } from './schemas.js';

export function createConversationRoutes(
  memoryAdapters: Map<string, FileMemoryAdapter>,
  logger: any,
  agentFixedTokens?: any,
  agentTools?: any,
  configLoader?: any,
  appConfig?: any,
  modelCatalog?: any,
) {
  const app = new Hono();

  // Get conversations for an agent
  app.get('/:slug/conversations', async (c) => {
    try {
      conversationOps.add(1, { operation: 'list' });
      const slug = param(c, 'slug');
      const adapter = memoryAdapters.get(slug);

      if (!adapter) {
        return c.json({ success: true, data: [] });
      }

      const conversations = await adapter.getConversations(slug);

      return c.json({ success: true, data: conversations });
    } catch (error: any) {
      logger.error('Failed to load conversations', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Update conversation (e.g., title)
  app.patch('/:slug/conversations/:conversationId', async (c) => {
    try {
      conversationOps.add(1, { operation: 'update', agent: param(c, 'slug') });
      const slug = param(c, 'slug');
      const conversationId = param(c, 'conversationId');
      const adapter = memoryAdapters.get(slug);

      if (!adapter) {
        return c.json({ success: false, error: 'Agent not found' }, 404);
      }

      const body = await c.req.json();
      const updated = await adapter.updateConversation(conversationId, body);

      return c.json({ success: true, data: updated });
    } catch (error: any) {
      logger.error('Failed to update conversation', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Delete conversation
  app.delete('/:slug/conversations/:conversationId', async (c) => {
    try {
      conversationOps.add(1, { operation: 'delete', agent: param(c, 'slug') });
      const slug = param(c, 'slug');
      const conversationId = param(c, 'conversationId');
      const adapter = memoryAdapters.get(slug);

      if (!adapter) {
        return c.json({ success: false, error: 'Agent not found' }, 404);
      }

      await adapter.deleteConversation(conversationId);

      return c.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to delete conversation', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Get messages for a conversation
  app.get('/:slug/conversations/:conversationId/messages', async (c) => {
    try {
      conversationOps.add(1, { operation: 'messages', agent: param(c, 'slug') });
      const slug = param(c, 'slug');
      const conversationId = param(c, 'conversationId');
      const adapter = memoryAdapters.get(slug);

      if (!adapter) {
        return c.json({ success: true, data: [] });
      }

      // Try with the standard userId format first, fall back to scanning
      let messages = await adapter.getMessages(
        `agent:${slug}`,
        conversationId,
      );
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
    } catch (error: any) {
      logger.error('Failed to load messages', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Manage conversation context (summarize, trim, etc.)
  app.post('/:slug/conversations/:conversationId/context', validate(contextActionSchema), async (c) => {
    try {
      const slug = param(c, 'slug');
      const conversationId = param(c, 'conversationId');
      const { action, content } = getBody(c);
      const result = await ConversationManager.manageConversationContext(slug, conversationId, action, content, memoryAdapters);
      return c.json(result);
    } catch (error: any) {
      logger.error('Failed to manage conversation context', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Get conversation token/stats
  app.get('/:slug/conversations/:conversationId/stats', async (c) => {
    try {
      const slug = param(c, 'slug');
      const conversationId = param(c, 'conversationId');
      const data = await ConversationManager.getConversationStats(slug, conversationId, memoryAdapters, agentFixedTokens, agentTools, configLoader, appConfig, modelCatalog, logger);
      return c.json({ success: true, data });
    } catch (error: any) {
      logger.error('Failed to get conversation stats', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  return app;
}
