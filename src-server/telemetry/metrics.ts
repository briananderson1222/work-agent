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
export const pluginUninstalls = meter.createCounter(
  'stallion.plugin.uninstalls',
  {
    description: 'Plugin uninstall events',
  },
);
export const pluginUpdates = meter.createCounter('stallion.plugin.updates', {
  description: 'Plugin update events',
});
export const pluginSettingsUpdates = meter.createCounter(
  'stallion.plugin.settings_updates',
  {
    description: 'Plugin settings update events',
  },
);
export const pluginServerRequests = meter.createCounter(
  'stallion.plugin.server_requests',
  {
    description: 'Plugin server-module request events',
  },
);
export const pluginServerRequestDuration = meter.createHistogram(
  'stallion.plugin.server_request_duration',
  {
    description: 'Plugin server-module request duration in milliseconds',
    unit: 'ms',
  },
);

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

export const adapterSessionStartDuration = meter.createHistogram(
  'stallion.adapter.session_start_duration',
  {
    description: 'Provider adapter session start duration',
    unit: 'ms',
  },
);

export const adapterTurnDuration = meter.createHistogram(
  'stallion.adapter.turn_duration',
  {
    description: 'Provider adapter turn duration',
    unit: 'ms',
  },
);

export const orchestrationCommandsDispatched = meter.createCounter(
  'stallion.orchestration.commands_dispatched',
  {
    description: 'Orchestration commands routed to provider adapters',
  },
);

export const orchestrationEventsPersisted = meter.createCounter(
  'stallion.orchestration.events_persisted',
  {
    description: 'Canonical orchestration events written to the event store',
  },
);

export const orchestrationEventPersistDuration = meter.createHistogram(
  'stallion.orchestration.event_persist_duration',
  {
    description: 'Canonical orchestration event persistence duration',
    unit: 'ms',
  },
);

// ── Notifications ──
export const notificationOps = meter.createCounter(
  'stallion.notification.operations',
  {
    description: 'Notification schedule/deliver/dismiss events',
  },
);
export const approvalInboxOps = meter.createCounter(
  'stallion.approval_inbox.operations',
  {
    description: 'Approval inbox open/resolve/action events',
  },
);
export const approvalGuardianOps = meter.createCounter(
  'stallion.approval_guardian.operations',
  {
    description:
      'Guardian review requests and decisions for approval-bound tools',
  },
);

// ── Context Safety ──
export const contextSafetyScans = meter.createCounter(
  'stallion.context_safety.scans',
  {
    description: 'Context safety scan operations',
  },
);
export const contextSafetyFindings = meter.createCounter(
  'stallion.context_safety.findings',
  {
    description: 'Context safety findings by rule and severity',
  },
);

// ── Scheduler ──
export const schedulerJobRuns = meter.createCounter(
  'stallion.scheduler.job.runs',
  {
    description: 'Scheduler job executions',
  },
);
export const schedulerJobDuration = meter.createHistogram(
  'stallion.scheduler.job.duration',
  {
    description: 'Scheduler job execution duration',
    unit: 'ms',
  },
);
export const schedulerHealthy = meter.createObservableGauge(
  'stallion.scheduler.healthy',
  { description: 'Scheduler heartbeat health (1=healthy, 0=unhealthy)' },
);

// ── MCP lifecycle ──
export const mcpLifecycle = meter.createCounter('stallion.mcp.lifecycle', {
  description: 'MCP connection lifecycle events',
});

// ── Knowledge ──
export const knowledgeOps = meter.createCounter(
  'stallion.knowledge.operations',
  {
    description: 'Knowledge query/index operations',
  },
);

// ── Feedback ──
export const feedbackOps = meter.createCounter('stallion.feedback.operations', {
  description: 'Feedback submission events',
});

// ── Tool Approvals ──
export const approvalOps = meter.createCounter('stallion.approval.operations', {
  description: 'Tool approval request/approve/deny events',
});
export const approvalDuration = meter.createHistogram(
  'stallion.approval.duration',
  {
    description: 'Time from approval request to decision',
    unit: 'ms',
  },
);

// ── Terminal ──
export const terminalOps = meter.createCounter('stallion.terminal.operations', {
  description: 'Terminal session lifecycle events',
});

// ── ACP ──
export const acpOps = meter.createCounter('stallion.acp.operations', {
  description: 'ACP connection lifecycle events',
});

// ── Voice ──
export const voiceOps = meter.createCounter('stallion.voice.operations', {
  description: 'Voice session lifecycle events',
});
export const voiceDuration = meter.createHistogram('stallion.voice.duration', {
  description: 'Voice session duration',
  unit: 'ms',
});

// ── Templates ──
export const templateOps = meter.createCounter('stallion.template.operations', {
  description: 'Template list/apply events',
});

// ── Conversations ──
export const conversationOps = meter.createCounter(
  'stallion.conversation.operations',
  {
    description: 'Conversation lifecycle events',
  },
);

// ── Coding ──
export const codingOps = meter.createCounter('stallion.coding.operations', {
  description: 'Coding session events',
});

// ── Auth ──
export const authOps = meter.createCounter('stallion.auth.operations', {
  description: 'Auth lifecycle events',
});

// ── File Tree ──
export const fileTreeOps = meter.createCounter('stallion.filetree.operations', {
  description: 'File tree browse events',
});

// ── Registry ──
export const registryOps = meter.createCounter('stallion.registry.operations', {
  description: 'Registry install/uninstall events',
});

// ── Skills ──
export const skillOps = meter.createCounter('stallion.skills.operations', {
  description: 'Skill CRUD operations',
});
export const skillDiscoveryDuration = meter.createHistogram(
  'stallion.skills.discovery_duration',
  {
    description: 'Skill discovery duration',
    unit: 'ms',
  },
);
export const skillDiscoveries = meter.createCounter(
  'stallion.skill.discoveries',
  {
    description: 'Skill discovery events',
  },
);
export const skillActivations = meter.createCounter(
  'stallion.skill.activations',
  {
    description: 'Skill activation events',
  },
);
export const skillActivationDuration = meter.createHistogram(
  'stallion.skill.activation.duration',
  {
    description: 'Skill activation duration',
    unit: 'ms',
  },
);

// ── Analytics ──
export const analyticsOps = meter.createCounter(
  'stallion.analytics.operations',
  {
    description: 'Analytics query events',
  },
);

// ── Bedrock ──
export const bedrockOps = meter.createCounter('stallion.bedrock.operations', {
  description: 'Bedrock model catalog events',
});

// ── Config ──
export const configOps = meter.createCounter('stallion.config.operations', {
  description: 'App config read/write events',
});

// ── SSE ──
export const sseOps = meter.createCounter('stallion.sse.operations', {
  description: 'SSE connection events',
});

// ── Insights ──
export const insightOps = meter.createCounter('stallion.insight.operations', {
  description: 'Insight query events',
});

// ── System ──
export const systemOps = meter.createCounter('stallion.system.operations', {
  description: 'System status/verify events',
});

// ── UI Commands ──
export const uiCommandOps = meter.createCounter(
  'stallion.uicommand.operations',
  {
    description: 'UI command execution events',
  },
);

export function registerObservableGauges(callbacks: {
  activeAgents: () => number;
  mcpConnections: () => number;
}): void {
  meter
    .createObservableGauge('stallion.agents.active', {
      description: 'Number of active agents',
    })
    .addCallback((obs) => obs.observe(callbacks.activeAgents()));

  meter
    .createObservableGauge('stallion.mcp.connections', {
      description: 'Number of MCP connections',
    })
    .addCallback((obs) => obs.observe(callbacks.mcpConnections()));
}
