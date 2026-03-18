import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { IEmbeddingProvider } from './types.js';

export class BedrockEmbeddingProvider implements IEmbeddingProvider {
  readonly id = 'bedrock-embedding';
  readonly displayName = 'Bedrock Embeddings (Titan V2)';
  private region: string;
  private model: string;

  constructor({
    region = '',
    embeddingModel = 'amazon.titan-embed-text-v2:0',
  }: { region?: string; embeddingModel?: string } = {}) {
    this.region = region;
    this.model = embeddingModel;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import(
      '@aws-sdk/client-bedrock-runtime'
    );
    const client = new BedrockRuntimeClient({
      region: this.region || undefined,
      credentials: fromNodeProviderChain(),
    });

    const results: number[][] = [];
    for (const text of texts) {
      const command = new InvokeModelCommand({
        modelId: this.model,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          inputText: text,
          dimensions: 1024,
          normalize: true,
        }),
      });
      const response = await client.send(command);
      const body = JSON.parse(new TextDecoder().decode(response.body));
      results.push(body.embedding);
    }
    return results;
  }

  dimensions(): number {
    return 1024;
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
