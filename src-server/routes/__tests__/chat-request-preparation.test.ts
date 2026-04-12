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
      options: { providerManagedFallback: true },
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

  test('prepareChatRequest skips provider resolution without an explicit fallback flag', async () => {
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

    expect(result.options.model).toBeUndefined();
    expect(result.useAlternateProvider).toBe(false);
    expect(result.resolvedProviderConn).toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('prepareChatRequest resolves a global provider when no model override is present', async () => {
    const result = await prepareChatRequest({
      ctx: {
        providerService: {
          resolveProvider: vi.fn(async () => ({
            model: 'llama3.2',
            providerId: 'ollama-local',
          })),
          listProviderConnections: vi.fn(() => [
            { id: 'ollama-local', type: 'ollama' },
          ]),
        },
        knowledgeService: {
          getInjectContext: vi.fn(async () => null),
          getRAGContext: vi.fn(async () => null),
        },
        feedbackService: {
          getBehaviorGuidelines: vi.fn(() => null),
        },
        storageAdapter: {} as any,
        logger: {
          warn: vi.fn(),
          debug: vi.fn(),
        },
      } as any,
      input: 'hello',
      options: { providerManagedFallback: true },
    });

    expect(result.options.model).toBe('llama3.2');
    expect(result.useAlternateProvider).toBe(true);
    expect(result.resolvedProviderConn).toMatchObject({
      id: 'ollama-local',
      type: 'ollama',
    });
  });

  test('prepareChatRequest honors explicit provider-managed binding from chat options', async () => {
    const resolveProvider = vi.fn(async () => ({
      model: 'llama3.2',
      providerId: 'ollama-local',
    }));
    const result = await prepareChatRequest({
      ctx: {
        providerService: {
          resolveProvider,
          listProviderConnections: vi.fn(() => [
            { id: 'ollama-local', type: 'ollama' },
          ]),
        },
        knowledgeService: {
          getInjectContext: vi.fn(async () => null),
          getRAGContext: vi.fn(async () => null),
        },
        feedbackService: {
          getBehaviorGuidelines: vi.fn(() => null),
        },
        storageAdapter: {} as any,
        logger: {
          warn: vi.fn(),
          debug: vi.fn(),
        },
      } as any,
      input: 'hello',
      options: {
        providerManagedFallback: true,
        providerId: 'ollama-local',
        providerModel: 'llama3.2',
      },
    });

    expect(resolveProvider).toHaveBeenCalledWith({
      conversationProviderId: 'ollama-local',
      conversationModel: 'llama3.2',
      projectSlug: undefined,
    });
    expect(result.options.model).toBe('llama3.2');
    expect(result.options.providerId).toBe('ollama-local');
    expect(result.useAlternateProvider).toBe(true);
  });

  test('prepareChatRequest does not resolve provider fallback without an explicit flag', async () => {
    const result = await prepareChatRequest({
      ctx: {
        providerService: {
          resolveProvider: vi.fn(async () => ({
            model: 'llama3.2',
            providerId: 'ollama-local',
          })),
          listProviderConnections: vi.fn(() => [
            { id: 'ollama-local', type: 'ollama' },
          ]),
        },
        knowledgeService: {
          getInjectContext: vi.fn(async () => null),
          getRAGContext: vi.fn(async () => null),
        },
        feedbackService: {
          getBehaviorGuidelines: vi.fn(() => null),
        },
        storageAdapter: {} as any,
        logger: {
          warn: vi.fn(),
          debug: vi.fn(),
        },
      } as any,
      input: 'hello',
      options: {},
    });

    expect(result.options.model).toBeUndefined();
    expect(result.useAlternateProvider).toBe(false);
    expect(result.resolvedProviderConn).toBeNull();
  });

  test('prepareChatRequest surfaces provider resolution failures when provider-managed fallback is explicit', async () => {
    await expect(
      prepareChatRequest({
        ctx: {
          providerService: {
            resolveProvider: vi.fn(async () => {
              throw new Error('No models available for provider');
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
          logger: {
            warn: vi.fn(),
            debug: vi.fn(),
          },
        } as any,
        input: 'hello',
        options: { providerManagedFallback: true },
      }),
    ).rejects.toThrow(/No models available/);
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
