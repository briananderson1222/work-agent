/**
 * Bedrock LLM Provider — wraps @ai-sdk/amazon-bedrock into ILLMProvider interface.
 */

import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { streamText } from 'ai';
import type {
  ILLMProvider,
  LLMModel,
  LLMStreamChunk,
  LLMStreamOpts,
} from './types.js';

export class BedrockLLMProvider implements ILLMProvider {
  readonly id = 'bedrock';
  readonly displayName = 'Amazon Bedrock';
  private region: string;

  constructor({ region }: { region: string }) {
    this.region = region;
  }

  private getProvider() {
    return createAmazonBedrock({
      region: this.region,
      credentialProvider: fromNodeProviderChain(),
    });
  }

  async listModels(): Promise<LLMModel[]> {
    try {
      const { BedrockClient, ListFoundationModelsCommand } = await import(
        '@aws-sdk/client-bedrock'
      );
      const client = new BedrockClient({ region: this.region });
      const res = await client.send(new ListFoundationModelsCommand({}));
      return (res.modelSummaries ?? [])
        .filter((m) => m.responseStreamingSupported)
        .map((m) => ({
          id: m.modelId!,
          name: m.modelName || m.modelId!,
          supportsTools: m.inferenceTypesSupported?.includes('ON_DEMAND'),
          supportsVision: m.inputModalities?.includes('IMAGE'),
        }));
    } catch {
      // Fallback: return common models
      return [
        {
          id: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
          name: 'Claude Sonnet 4',
        },
        {
          id: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
          name: 'Claude 3.5 Sonnet v2',
        },
        {
          id: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
          name: 'Claude 3.5 Haiku',
        },
      ];
    }
  }

  async *createStream(opts: LLMStreamOpts): AsyncIterable<LLMStreamChunk> {
    const provider = this.getProvider();
    const model = provider.languageModel(opts.model);

    const result = streamText({
      model,
      messages: opts.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      ...(opts.temperature !== undefined
        ? { temperature: opts.temperature }
        : {}),
      ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
      abortSignal: opts.signal,
    });

    for await (const part of result.fullStream) {
      if (opts.signal?.aborted) break;
      if (part.type === 'text-delta') {
        yield {
          type: 'text-delta',
          content: (part as any).textDelta ?? (part as any).text ?? '',
        };
      } else if (part.type === 'finish') {
        const usage = (part as any).totalUsage ?? (part as any).usage;
        yield {
          type: 'finish',
          finishReason: part.finishReason,
          usage: usage
            ? {
                inputTokens: usage.promptTokens ?? 0,
                outputTokens: usage.completionTokens ?? 0,
              }
            : undefined,
        };
      } else if (part.type === 'error') {
        yield { type: 'error', error: String((part as any).error) };
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const creds = fromNodeProviderChain();
      await creds();
      return true;
    } catch {
      return false;
    }
  }
}
