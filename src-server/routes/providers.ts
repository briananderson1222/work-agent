/**
 * Provider Connection Routes
 */

import { randomUUID } from 'node:crypto';
import type { ProviderConnectionConfig } from '@stallion-ai/shared';
import { Hono } from 'hono';
import { BedrockEmbeddingProvider } from '../providers/bedrock-embedding-provider.js';
import { BedrockLLMProvider } from '../providers/bedrock-llm-provider.js';
import { LanceDBProvider } from '../providers/lancedb-provider.js';
import {
  OllamaEmbeddingProvider,
  OllamaLLMProvider,
} from '../providers/ollama-provider.js';
import {
  OpenAICompatEmbeddingProvider,
  OpenAICompatLLMProvider,
} from '../providers/openai-compat-provider.js';
import type {
  IEmbeddingProvider,
  ILLMProvider,
  IVectorDbProvider,
} from '../providers/types.js';
import type { ProviderService } from '../services/provider-service.js';
import { providerOps } from '../telemetry/metrics.js';
import {
  errorMessage,
  getBody,
  param,
  providerSchema,
  validate,
} from './schemas.js';

// ── Provider config interfaces (narrowed from Record<string, unknown>) ──
interface OllamaConfig {
  baseUrl?: string;
}
interface OpenAICompatConfig {
  baseUrl: string;
  apiKey?: string;
}
interface BedrockProviderConfig {
  region: string;
}
interface LanceDBConfig {
  dataDir?: string;
}
interface BedrockEmbeddingConfig {
  region?: string;
  embeddingModel?: string;
}

function createLLMProvider(
  conn: ProviderConnectionConfig,
): ILLMProvider | null {
  if (conn.type === 'ollama')
    return new OllamaLLMProvider(conn.config as OllamaConfig);
  if (conn.type === 'openai-compat')
    return new OpenAICompatLLMProvider(
      conn.config as unknown as OpenAICompatConfig,
    );
  if (conn.type === 'bedrock')
    return new BedrockLLMProvider(
      conn.config as unknown as BedrockProviderConfig,
    );
  return null;
}

export function createVectorDbProvider(
  conn: ProviderConnectionConfig,
): IVectorDbProvider | null {
  if (conn.type === 'lancedb')
    return new LanceDBProvider(conn.config as LanceDBConfig);
  return null;
}

export function createEmbeddingProvider(
  conn: ProviderConnectionConfig,
): IEmbeddingProvider | null {
  if (conn.type === 'ollama')
    return new OllamaEmbeddingProvider(conn.config as OllamaConfig);
  if (conn.type === 'openai-compat')
    return new OpenAICompatEmbeddingProvider(
      conn.config as unknown as OpenAICompatConfig,
    );
  if (conn.type === 'bedrock')
    return new BedrockEmbeddingProvider(conn.config as BedrockEmbeddingConfig);
  return null;
}

export function createProviderRoutes(providerService: ProviderService) {
  const app = new Hono();

  app.get('/', async (c) => {
    try {
      providerOps.add(1, { op: 'list' });
      const data = await providerService.listProviderConnections();
      return c.json({ success: true, data });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/', validate(providerSchema), async (c) => {
    try {
      const body = getBody(c) as ProviderConnectionConfig;
      if (!body.id) body.id = randomUUID();
      providerOps.add(1, { op: 'register' });
      await providerService.saveProviderConnection(body);
      return c.json({ success: true, data: body }, 201);
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  app.put('/:id', validate(providerSchema), async (c) => {
    try {
      const body = getBody(c) as ProviderConnectionConfig;
      await providerService.saveProviderConnection(body);
      return c.json({ success: true, data: body });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  app.delete('/:id', async (c) => {
    try {
      const id = param(c, 'id');
      providerOps.add(1, { op: 'delete' });
      await providerService.deleteProviderConnection(id);
      return c.json({ success: true });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  app.post('/:id/test', async (c) => {
    try {
      const id = param(c, 'id');
      const connections = await providerService.listProviderConnections();
      const conn = connections.find((p) => p.id === id);
      if (!conn)
        return c.json({ success: false, error: 'Provider not found' }, 404);

      const provider = createLLMProvider(conn);
      if (!provider)
        return c.json(
          {
            success: false,
            error: `No provider implementation for type: ${conn.type}`,
          },
          400,
        );

      const healthy = await providerService.checkHealth(provider, conn.type);
      return c.json({ success: true, data: { healthy } });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.get('/:id/health', async (c) => {
    try {
      const id = param(c, 'id');
      providerOps.add(1, { op: 'health' });
      const connections = await providerService.listProviderConnections();
      const conn = connections.find((p) => p.id === id);
      if (!conn)
        return c.json({ success: false, error: 'Provider not found' }, 404);

      const provider = createLLMProvider(conn);
      if (!provider)
        return c.json({
          success: true,
          data: {
            healthy: false,
            reason: `No implementation for type: ${conn.type}`,
          },
        });

      const healthy = await providerService.checkHealth(provider, conn.type);
      return c.json({
        success: true,
        data: { healthy, type: conn.type, name: conn.name },
      });
    } catch (error: unknown) {
      return c.json({
        success: true,
        data: { healthy: false, reason: errorMessage(error) },
      });
    }
  });

  app.get('/:id/models', async (c) => {
    try {
      const id = param(c, 'id');
      const connections = await providerService.listProviderConnections();
      const conn = connections.find((p) => p.id === id);
      if (!conn)
        return c.json({ success: false, error: 'Provider not found' }, 404);

      const provider = createLLMProvider(conn);
      if (!provider)
        return c.json(
          {
            success: false,
            error: `No provider implementation for type: ${conn.type}`,
          },
          400,
        );

      const models = await provider.listModels();
      return c.json({ success: true, data: models });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/:id/test-embedding', async (c) => {
    try {
      const id = param(c, 'id');
      const connections = await providerService.listProviderConnections();
      const conn = connections.find((p) => p.id === id);
      if (!conn)
        return c.json({ success: false, error: 'Provider not found' }, 404);
      const provider = createEmbeddingProvider(conn);
      if (!provider)
        return c.json(
          {
            success: false,
            error: `No embedding implementation for type: ${conn.type}`,
          },
          400,
        );
      const healthy = (await provider.healthCheck?.()) ?? true;
      return c.json({ success: true, data: { healthy } });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/:id/test-vectordb', async (c) => {
    try {
      const id = param(c, 'id');
      const connections = await providerService.listProviderConnections();
      const conn = connections.find((p) => p.id === id);
      if (!conn)
        return c.json({ success: false, error: 'Provider not found' }, 404);
      const provider = createVectorDbProvider(conn);
      if (!provider)
        return c.json(
          {
            success: false,
            error: `No vectordb implementation for type: ${conn.type}`,
          },
          400,
        );
      const healthy = await provider
        .namespaceExists('__health-check')
        .then(() => true)
        .catch(() => false);
      return c.json({ success: true, data: { healthy } });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  return app;
}
