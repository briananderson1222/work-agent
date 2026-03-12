/**
 * LLM Router — instantiates ILLMProvider from ProviderConnectionConfig
 * and streams responses for non-Bedrock providers.
 */

import type { ProviderConnectionConfig } from '@stallion-ai/shared';
import { BedrockLLMProvider } from '../providers/bedrock-llm-provider.js';
import { OllamaLLMProvider } from '../providers/ollama-provider.js';
import { OpenAICompatLLMProvider } from '../providers/openai-compat-provider.js';
import type { ILLMProvider, LLMMessage } from '../providers/types.js';
import { providerOps } from '../telemetry/metrics.js';

export function createLLMProviderFromConfig(
  conn: ProviderConnectionConfig,
): ILLMProvider | null {
  switch (conn.type) {
    case 'ollama':
      providerOps.add(1, { op: 'route', provider: conn.type });
      return new OllamaLLMProvider(conn.config as any);
    case 'openai-compat':
      providerOps.add(1, { op: 'route', provider: conn.type });
      return new OpenAICompatLLMProvider(conn.config as any);
    case 'bedrock':
      providerOps.add(1, { op: 'route', provider: conn.type });
      return new BedrockLLMProvider(conn.config as any);
    default:
      providerOps.add(1, {
        op: 'route_error',
        provider: conn.type ?? 'unknown',
      });
      return null;
  }
}

/**
 * Stream a chat response using an ILLMProvider, emitting SSE events
 * compatible with the existing frontend ConversationsContext parser.
 */
export async function streamWithProvider(
  provider: ILLMProvider,
  model: string,
  messages: LLMMessage[],
  writer: { write: (data: string) => Promise<void> },
  conversationId: string,
  signal?: AbortSignal,
): Promise<void> {
  const stream = provider.createStream({ model, messages, signal });
  let accumulatedText = '';

  // Send conversation metadata
  await writer.write(
    `data: ${JSON.stringify({
      type: 'conversation',
      conversationId,
      title:
        messages.find((m) => m.role === 'user')?.content?.slice(0, 60) ||
        'Chat',
    })}\n\n`,
  );

  for await (const chunk of stream) {
    if (signal?.aborted) break;

    if (chunk.type === 'text-delta' && chunk.content) {
      accumulatedText += chunk.content;
      await writer.write(
        `data: ${JSON.stringify({
          type: 'text-delta',
          textDelta: chunk.content,
        })}\n\n`,
      );
    } else if (chunk.type === 'finish') {
      await writer.write(
        `data: ${JSON.stringify({
          type: 'finish',
          finishReason: chunk.finishReason || 'stop',
          usage: chunk.usage || { inputTokens: 0, outputTokens: 0 },
        })}\n\n`,
      );
    } else if (chunk.type === 'error') {
      await writer.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: chunk.error || 'Unknown error',
        })}\n\n`,
      );
    }
  }

  // Ensure finish event is sent
  if (accumulatedText) {
    await writer.write(
      `data: ${JSON.stringify({
        type: 'result',
        text: accumulatedText,
      })}\n\n`,
    );
  }
}
