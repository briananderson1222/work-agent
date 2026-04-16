import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, test } from 'vitest';
import { VoltAgentFramework } from '../voltagent-adapter.js';

type TestServer = {
  url: string;
  close: () => Promise<void>;
};

async function startOpenAICompatServer(options?: {
  expectedPath?: string;
  responseText?: string;
}): Promise<TestServer> {
  const expectedPath = options?.expectedPath ?? '/chat/completions';
  const responseText = options?.responseText ?? 'compat-ok';

  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== expectedPath) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
    }
    const payload = JSON.parse(body);

    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: Date.now(),
        model: payload.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: responseText,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 2,
          total_tokens: 7,
        },
      }),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

describe('VoltAgentFramework', () => {
  const servers: TestServer[] = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()!.close();
    }
  });

  test('supports openai-compatible managed model connections', async () => {
    const server = await startOpenAICompatServer({
      responseText: 'compat-managed-ok',
    });
    servers.push(server);

    const framework = new VoltAgentFramework();
    const model = await framework.createModel(
      {
        execution: {
          modelConnectionId: 'compat-main',
          modelId: 'gpt-4.1',
        },
      } as any,
      {
        appConfig: {
          defaultModel: 'unused-default',
          defaultLLMProvider: 'compat-main',
        },
        projectHomeDir: '/tmp/project',
        listProviderConnections: () =>
          [
            {
              id: 'compat-main',
              type: 'openai-compat',
              enabled: true,
              capabilities: ['llm'],
              name: 'Compat',
              config: {
                baseUrl: server.url,
                apiKey: 'test-key',
                defaultModel: 'gpt-4.1',
              },
            },
          ] as any,
      } as any,
    );

    const agent = await framework.createTempAgent({
      name: 'compat-agent',
      instructions: 'Be concise.',
      model,
      tools: [],
    });
    const result = await agent.generateText('hello');

    expect(result.text).toContain('compat-managed-ok');
  });

  test('normalizes ollama managed model connections to the /v1 endpoint', async () => {
    const server = await startOpenAICompatServer({
      expectedPath: '/v1/chat/completions',
      responseText: 'ollama-managed-ok',
    });
    servers.push(server);

    const framework = new VoltAgentFramework();
    const model = await framework.createModel(
      {
        execution: {
          modelConnectionId: 'ollama-main',
          modelId: 'llama3.2',
        },
      } as any,
      {
        appConfig: {
          defaultModel: 'unused-default',
          defaultLLMProvider: 'ollama-main',
        },
        projectHomeDir: '/tmp/project',
        listProviderConnections: () =>
          [
            {
              id: 'ollama-main',
              type: 'ollama',
              enabled: true,
              capabilities: ['llm'],
              name: 'Ollama',
              config: {
                baseUrl: server.url,
                defaultModel: 'llama3.2',
              },
            },
          ] as any,
      } as any,
    );

    const agent = await framework.createTempAgent({
      name: 'ollama-agent',
      instructions: 'Be concise.',
      model,
      tools: [],
    });
    const result = await agent.generateText('hello');

    expect(result.text).toContain('ollama-managed-ok');
  });
});
