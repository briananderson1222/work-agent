/**
 * Agent Service - handles agent CRUD and lifecycle operations
 */

type Agent = any;

import type { ConfigLoader } from '../domain/config-loader.js';
import type { AgentSpec } from '../domain/types.js';
import { agentOps } from '../telemetry/metrics.js';

export interface AgentMetadata {
  slug: string;
  name: string;
  description?: string;
  updatedAt?: string;
}

export interface EnrichedAgent {
  id: string;
  slug: string;
  name: string;
  prompt?: string;
  description?: string;
  model?: string;
  region?: string;
  guardrails?: AgentSpec['guardrails'];
  maxTurns?: number;
  icon?: string;
  commands?: AgentSpec['commands'];
  toolsConfig?: AgentSpec['tools'];
  updatedAt?: string;
}

export class AgentService {
  constructor(
    private configLoader: ConfigLoader,
    private activeAgents: Map<string, Agent>,
    private agentMetadataMap: Map<string, AgentMetadata>,
    _agentSpecs: Map<string, AgentSpec>,
    private logger: any,
  ) {}

  async listAgents(): Promise<AgentMetadata[]> {
    agentOps.add(1, { operation: 'list' });
    return this.configLoader.listAgents();
  }

  async getEnrichedAgents(
    coreAgents: Array<{ id: string; [key: string]: any }>,
  ): Promise<EnrichedAgent[]> {
    const enriched = await Promise.all(
      coreAgents.map(async (agent: { id: string; [key: string]: any }) => {
        const metadata = this.agentMetadataMap.get(agent.id);
        if (!metadata) return null;

        try {
          const spec = await this.configLoader.loadAgent(metadata.slug);
          return {
            ...agent,
            slug: metadata.slug,
            name: metadata.name,
            prompt: spec.prompt,
            description: spec.description,
            model: spec.model,
            region: spec.region,
            guardrails: spec.guardrails,
            maxTurns: spec.maxTurns,
            icon: spec.icon,
            commands: spec.commands,
            toolsConfig: spec.tools,
            updatedAt: metadata.updatedAt,
          } as EnrichedAgent;
        } catch {
          this.logger.warn('Agent spec not found, skipping', {
            agent: metadata.slug,
          });
          return null;
        }
      }),
    );
    return enriched.filter((a): a is EnrichedAgent => a !== null);
  }

  async createAgent(
    body: Record<string, any>,
  ): Promise<{ slug: string; spec: AgentSpec }> {
    const { slug, spec } = await this.configLoader.createAgent(
      body as AgentSpec,
    );
    agentOps.add(1, { operation: 'create' });
    return { slug, spec };
  }

  async updateAgent(
    slug: string,
    updates: Record<string, any>,
  ): Promise<AgentSpec> {
    // Remove null values to allow unsetting optional fields
    const filtered = Object.entries(updates).reduce(
      (acc, [key, value]) => {
        if (value !== null) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, any>,
    );

    const result = await this.configLoader.updateAgent(slug, filtered);
    agentOps.add(1, { operation: 'update' });
    return result;
  }

  async deleteAgent(
    slug: string,
  ): Promise<{ success: boolean; error?: string }> {
    // Check if any layouts reference this agent
    const dependentLayouts = await this.configLoader.getLayoutsUsingAgent(slug);
    if (dependentLayouts.length > 0) {
      return {
        success: false,
        error: `Cannot delete agent '${slug}' - it is referenced by layouts: ${dependentLayouts.join(', ')}`,
      };
    }

    // Drain agent if active
    if (this.activeAgents.has(slug)) {
      this.activeAgents.delete(slug);
    }

    await this.configLoader.deleteAgent(slug);
    agentOps.add(1, { operation: 'delete' });
    return { success: true };
  }

  async loadAgentSpec(slug: string): Promise<AgentSpec> {
    return this.configLoader.loadAgent(slug);
  }

  getActiveAgent(slug: string): Agent | undefined {
    return this.activeAgents.get(slug);
  }

  isAgentActive(slug: string): boolean {
    return this.activeAgents.has(slug);
  }
}
