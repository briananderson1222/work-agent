import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { IEmbeddingProvider } from './types.js';
import { checkBedrockCredentials } from './bedrock.js';

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

  async getPrerequisites(): Promise<import('@stallion-ai/shared').Prerequisite[]> {
    const hasCreds = await checkBedrockCredentials();
    return [
      {
        id: 'bedrock',
        name: 'Bedrock Credentials',
        description: 'AWS credentials with Bedrock model access',
        status: hasCreds ? 'installed' : 'missing',
        category: 'required',
        installGuide: {
          steps: ['Configure AWS credentials with Bedrock access'],
          links: [
            'https://docs.aws.amazon.com/bedrock/latest/userguide/setting-up.html',
          ],
        },
      },
    ];
  }
}
