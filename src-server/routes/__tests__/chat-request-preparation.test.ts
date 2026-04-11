import { describe, expect, test, vi } from 'vitest';
import {
  extractChatUserText,
  prepareChatRequest,
} from '../chat-request-preparation.js';

describe('chat-request-preparation', () => {
  test('prepareChatRequest resolves project provider overrides and knowledge context', async () => {
    const result = await prepareChatRequest({
      ctx: {
        providerService: {
          resolveProvider: vi.fn(async () => ({
            model: 'claude-3',
            providerId: 'conn-2',
          })),
          listProviderConnections: vi.fn(() => [
            { id: 'conn-1', type: 'bedrock' },
            { id: 'conn-2', type: 'openai-compat' },
          ]),
        },
        knowledgeService: {
          getInjectContext: vi.fn(async () => 'inject-context'),
          getRAGContext: vi.fn(async () => 'rag-context'),
        },
        feedbackService: {
          getBehaviorGuidelines: vi.fn(() => 'feedback-guidelines'),
        },
        storageAdapter: {} as any,
        logger: {
          warn: vi.fn(),
          debug: vi.fn(),
        },
      } as any,
      input: 'How do I deploy this?',
      options: {},
      projectSlug: 'proj-1',
    });

    expect(result.options.model).toBe('claude-3');
    expect(result.useAlternateProvider).toBe(true);
    expect(result.resolvedProviderConn).toMatchObject({
      id: 'conn-2',
      type: 'openai-compat',
    });
    expect(result.injectContext).toBe('inject-context');
    expect(result.ragContext).toBe('rag-context\n\nfeedback-guidelines');
  });

  test('prepareChatRequest logs and continues when provider resolution fails', async () => {
    const logger = {
      warn: vi.fn(),
      debug: vi.fn(),
    };

    const result = await prepareChatRequest({
      ctx: {
        providerService: {
          resolveProvider: vi.fn(async () => {
            throw new Error('boom');
          }),
          listProviderConnections: vi.fn(() => []),
        },
        knowledgeService: {
          getInjectContext: vi.fn(async () => null),
          getRAGContext: vi.fn(async () => null),
        },
        feedbackService: {
          getBehaviorGuidelines: vi.fn(() => null),
        },
        storageAdapter: {} as any,
        logger,
      } as any,
      input: 'hello',
      options: {},
      projectSlug: 'proj-1',
    });

    expect(result.useAlternateProvider).toBe(false);
    expect(result.resolvedProviderConn).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to resolve project provider',
      expect.objectContaining({ projectSlug: 'proj-1', error: 'boom' }),
    );
  });

  test('extractChatUserText returns the first user text part', () => {
    expect(
      extractChatUserText([
        {
          role: 'system',
          parts: [{ type: 'text', text: 'system' }],
        },
        {
          role: 'user',
          parts: [
            { type: 'file', text: 'ignored' },
            { type: 'text', text: 'user message' },
          ],
        },
      ]),
    ).toBe('user message');
  });
});
