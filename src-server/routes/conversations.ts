/**
 * Conversation Routes - conversation and message management
 */

import { Hono } from 'hono';
import type { FileVoltAgentMemoryAdapter } from '../adapters/file/voltagent-memory-adapter.js';

export function createConversationRoutes(
  memoryAdapters: Map<string, FileVoltAgentMemoryAdapter>,
  logger: any
) {
  const app = new Hono();

  // Get conversations for an agent
  app.get('/:slug/conversations', async (c) => {
    try {
      const slug = c.req.param('slug');
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
      const slug = c.req.param('slug');
      const conversationId = c.req.param('conversationId');
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
      const slug = c.req.param('slug');
      const conversationId = c.req.param('conversationId');
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
      const slug = c.req.param('slug');
      const conversationId = c.req.param('conversationId');
      const adapter = memoryAdapters.get(slug);
      
      if (!adapter) {
        return c.json({ success: true, data: [] });
      }

      const messages = await adapter.getMessages(`agent:${slug}`, conversationId);
      
      return c.json({ success: true, data: messages });
    } catch (error: any) {
      logger.error('Failed to load messages', { error });
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  return app;
}
