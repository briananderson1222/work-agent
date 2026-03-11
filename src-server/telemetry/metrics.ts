/**
 * OTel metric instruments and tracer for Stallion.
 * Safe to import even when no SDK is configured — all instruments become no-ops.
 */

import { metrics, trace } from '@opentelemetry/api';

const meter = metrics.getMeter('stallion');

export const tracer = trace.getTracer('stallion');

export const chatRequests = meter.createCounter('stallion.chat.requests', {
  description: 'Total chat requests',
});

export const tokensInput = meter.createCounter('stallion.tokens.input', {
  description: 'Input tokens consumed',
});

export const tokensOutput = meter.createCounter('stallion.tokens.output', {
  description: 'Output tokens consumed',
});

export const toolCalls = meter.createCounter('stallion.tool.calls', {
  description: 'Total tool calls',
});

export const chatDuration = meter.createHistogram('stallion.chat.duration', {
  description: 'Chat request duration',
  unit: 'ms',
});

export const toolDuration = meter.createHistogram('stallion.tool.duration', {
  description: 'Tool execution duration',
  unit: 'ms',
});

export const chatErrors = meter.createCounter('stallion.chat.errors', {
  description: 'Total chat errors',
});

export const contextTokens = meter.createCounter('stallion.tokens.context', {
  description: 'Fixed context tokens per request (system prompt + MCP tools)',
});

export const costEstimated = meter.createCounter('stallion.cost.estimated', {
  description: 'Estimated cost in USD',
});

// ── Plugins ──
export const pluginInstalls = meter.createCounter('stallion.plugin.installs', {
  description: 'Plugin install events',
});
export const pluginUninstalls = meter.createCounter('stallion.plugin.uninstalls', {
  description: 'Plugin uninstall events',
});
export const pluginUpdates = meter.createCounter('stallion.plugin.updates', {
  description: 'Plugin update events',
});

// ── CRUD operations ──
export const agentOps = meter.createCounter('stallion.agent.operations', {
  description: 'Agent CRUD operations',
});
export const layoutOps = meter.createCounter('stallion.layout.operations', {
  description: 'Layout CRUD operations',
});
export const projectOps = meter.createCounter('stallion.project.operations', {
  description: 'Project CRUD operations',
});
export const promptOps = meter.createCounter('stallion.prompt.operations', {
  description: 'Prompt CRUD operations',
});

// ── Providers ──
export const providerOps = meter.createCounter('stallion.provider.operations', {
  description: 'Provider register/remove/health events',
});

// ── Notifications ──
export const notificationOps = meter.createCounter('stallion.notification.operations', {
  description: 'Notification schedule/deliver/dismiss events',
});

// ── Scheduler ──
export const schedulerJobRuns = meter.createCounter('stallion.scheduler.job.runs', {
  description: 'Scheduler job executions',
});
export const schedulerJobDuration = meter.createHistogram('stallion.scheduler.job.duration', {
  description: 'Scheduler job execution duration',
  unit: 'ms',
});

// ── MCP lifecycle ──
export const mcpLifecycle = meter.createCounter('stallion.mcp.lifecycle', {
  description: 'MCP connection lifecycle events',
});

// ── Knowledge ──
export const knowledgeOps = meter.createCounter('stallion.knowledge.operations', {
  description: 'Knowledge query/index operations',
});

export function registerObservableGauges(callbacks: {
  activeAgents: () => number;
  mcpConnections: () => number;
}): void {
  meter.createObservableGauge('stallion.agents.active', {
    description: 'Number of active agents',
  }).addCallback((obs) => obs.observe(callbacks.activeAgents()));

  meter.createObservableGauge('stallion.mcp.connections', {
    description: 'Number of MCP connections',
  }).addCallback((obs) => obs.observe(callbacks.mcpConnections()));
}
