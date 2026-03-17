import type {
  IEmbeddingProvider,
  ILLMProvider,
  LLMModel,
  LLMStreamChunk,
  LLMStreamOpts,
} from './types.js';

export class OpenAICompatLLMProvider implements ILLMProvider {
  readonly id = 'openai-compat';
  readonly displayName = 'OpenAI-Compatible';
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor({ baseUrl, apiKey }: { baseUrl: string; apiKey?: string }) {
    this.baseUrl = baseUrl;
    this.headers = {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
  }

  async listModels(): Promise<LLMModel[]> {
    const res = await fetch(`${this.baseUrl}/models`, {
      headers: this.headers,
    });
    const data = (await res.json()) as { data: Array<{ id: string }> };
    return data.data.map((m) => ({ id: m.id, name: m.id }));
  }

  async *createStream(opts: LLMStreamOpts): AsyncIterable<LLMStreamChunk> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
        ...(opts.temperature !== undefined
          ? { temperature: opts.temperature }
          : {}),
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
      }),
      signal: opts.signal,
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') {
          yield { type: 'finish' };
          return;
        }
        try {
          const chunk = JSON.parse(payload) as {
            choices: Array<{
              delta?: { content?: string };
              finish_reason?: string;
            }>;
          };
          const content = chunk.choices[0]?.delta?.content;
          if (content) yield { type: 'text-delta', content };
          if (chunk.choices[0]?.finish_reason)
            yield {
              type: 'finish',
              finishReason: chunk.choices[0].finish_reason,
            };
        } catch (e) {
          console.debug('Failed to parse SSE chunk from OpenAI-compat stream:', e);
          /* skip malformed */
        }
      }
    }

    yield { type: 'finish' };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this.headers,
      });
      return res.ok;
    } catch (e) {
      console.debug('Failed to check OpenAI-compat provider health:', e);
      return false;
    }
  }
}

export class OpenAICompatEmbeddingProvider implements IEmbeddingProvider {
  readonly id = 'openai-compat-embedding';
  readonly displayName = 'OpenAI-Compatible Embeddings';
  private baseUrl: string;
  private model: string;
  private headers: Record<string, string>;

  constructor({
    baseUrl,
    apiKey,
    model = 'text-embedding-3-small',
  }: { baseUrl: string; apiKey?: string; model?: string }) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.headers = {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }

  dimensions(): number {
    return 1536;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this.headers,
      });
      return res.ok;
    } catch (e) {
      console.debug('Failed to check OpenAI-compat embedding provider health:', e);
      return false;
    }
  }
}
