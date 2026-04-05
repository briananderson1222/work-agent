/**
 * Enriched Agent Routes — list and get agents with full spec details.
 * Extracted from stallion-runtime.ts for schema compliance.
 */

import type { AgentSpec } from '@stallion-ai/shared';
import { Hono } from 'hono';
import type { AgentMetadata } from '../services/agent-service.js';
import type { Logger } from '../utils/logger.js';
import { errorMessage, param } from './schemas.js';

export interface EnrichedAgentDeps {
  agentMetadataMap: Map<string, AgentMetadata>;
  activeAgents: Map<string, unknown>;
  loadAgent: (slug: string) => Promise<AgentSpec>;
  defaultModel: string;
  defaultTools: { mcpServers: string[]; autoApprove: string[] };
  getVirtualAgents: () => unknown[];
  isACPConnected: () => boolean;
  reloadAgents: () => Promise<void>;
  logger: Logger;
}

export function createEnrichedAgentRoutes(deps: EnrichedAgentDeps) {
  const app = new Hono();

  function buildAgentPayload(
    slug: string,
    metadata: AgentMetadata,
    spec: AgentSpec,
  ) {
    return {
      slug,
      name: metadata.name,
      prompt: spec.prompt,
      description: spec.description,
      model: spec.model,
      region: spec.region,
      guardrails: spec.guardrails,
      maxSteps: spec.maxSteps,
      icon: spec.icon,
      commands: spec.commands,
      toolsConfig: spec.tools,
      execution: spec.execution,
      skills: spec.skills,
      updatedAt: metadata.updatedAt,
    };
  }

  function defaultSpec(metadata: AgentMetadata): AgentSpec {
    return {
      name: 'default',
      prompt: metadata.description ?? '',
      description: metadata.description,
      model: deps.defaultModel,
      tools: deps.defaultTools,
    };
  }

  app.get('/', async (c) => {
    try {
      await deps.reloadAgents();
      const enrichedAgents = (
        await Promise.all(
          Array.from(deps.agentMetadataMap.entries()).map(
            async ([slug, metadata]) => {
              if (!deps.activeAgents.has(slug)) return null;
              try {
                const spec =
                  slug === 'default'
                    ? defaultSpec(metadata)
                    : await deps.loadAgent(slug);
                return buildAgentPayload(slug, metadata, spec);
              } catch (e) {
                deps.logger.warn('Agent spec not found, skipping', {
                  agent: slug,
                  error: e,
                });
                return null;
              }
            },
          ),
        )
      ).filter((a) => a !== null);
      if (deps.isACPConnected())
        enrichedAgents.push(
          ...(deps.getVirtualAgents() as typeof enrichedAgents),
        );
      return c.json({ success: true, data: enrichedAgents });
    } catch (error: unknown) {
      deps.logger.error('Failed to fetch agents', {
        error: errorMessage(error),
      });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.get('/:slug', async (c) => {
    const slug = param(c, 'slug');
    const metadata = deps.agentMetadataMap.get(slug);
    if (!metadata || !deps.activeAgents.has(slug)) {
      return c.json({ success: false, error: 'Agent not found' }, 404);
    }
    try {
      const spec =
        slug === 'default' ? defaultSpec(metadata) : await deps.loadAgent(slug);
      return c.json({
        success: true,
        data: buildAgentPayload(slug, metadata, spec),
      });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  return app;
}
