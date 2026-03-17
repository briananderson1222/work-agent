import type {
  IEmbeddingProvider,
  ILLMProvider,
  LLMModel,
  LLMStreamChunk,
  LLMStreamOpts,
} from './types.js';

export class OllamaLLMProvider implements ILLMProvider {
  readonly id = 'ollama';
  readonly displayName = 'Ollama';
  private baseUrl: string;

  constructor({
    baseUrl = 'http://localhost:11434',
  }: { baseUrl?: string } = {}) {
    this.baseUrl = baseUrl;
  }

  async listModels(): Promise<LLMModel[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`);
    const data = (await res.json()) as { models: Array<{ name: string }> };
    return data.models.map((m) => ({ id: m.name, name: m.name }));
  }

  async *createStream(opts: LLMStreamOpts): AsyncIterable<LLMStreamChunk> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
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
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
          };
          if (chunk.message?.content) {
            yield { type: 'text-delta', content: chunk.message.content };
          }
        } catch (e) {
          console.debug('Failed to parse Ollama stream chunk:', e);
          /* skip malformed */
        }
      }
    }

    yield { type: 'finish' };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch (e) {
      console.debug('Failed to check Ollama LLM provider health:', e);
      return false;
    }
  }
}

export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  readonly id = 'ollama-embedding';
  readonly displayName = 'Ollama Embeddings';
  private baseUrl: string;
  private model: string;

  constructor({
    baseUrl = 'http://localhost:11434',
    model = 'nomic-embed-text',
  }: { baseUrl?: string; model?: string } = {}) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    const data = (await res.json()) as { embeddings: number[][] };
    return data.embeddings;
  }

  dimensions(): number {
    return 768;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch (e) {
      console.debug('Failed to check Ollama embedding provider health:', e);
      return false;
    }
  }
}
