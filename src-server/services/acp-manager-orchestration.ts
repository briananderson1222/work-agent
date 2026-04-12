import { homedir } from 'node:os';
import type { ACPConnectionConfig } from '@stallion-ai/contracts/acp';
import type { Context } from 'hono';
import { ACPProbe } from './acp-probe.js';

type EventBus = {
  emit: (event: string, data?: Record<string, unknown>) => void;
};

interface ACPProbeLike {
  probe(): Promise<boolean>;
}

interface ACPConnectionLike {
  config: { id: string };
  shutdown(): Promise<void>;
  isIdle(): boolean;
  isStale(): boolean;
  handleChat(
    c: Context,
    slug: string,
    input: any,
    options: any,
    context?: { cwd?: string; conversationId?: string },
  ): Promise<Response>;
}

export async function runACPManagerProbes({
  sessions,
  probes,
  eventBus,
  getVirtualAgentCount,
}: {
  sessions: Map<string, ACPConnectionLike>;
  probes: Map<string, ACPProbeLike>;
  eventBus?: EventBus;
  getVirtualAgentCount: () => number;
}): Promise<void> {
  if (sessions.size > 0) return;

  const before = getVirtualAgentCount();
  await Promise.all(Array.from(probes.values()).map((probe) => probe.probe()));
  if (getVirtualAgentCount() !== before) {
    eventBus?.emit('agents:changed');
  }
}

export async function sweepACPManagerIdleSessions({
  sessions,
}: {
  sessions: Map<string, ACPConnectionLike>;
}): Promise<void> {
  for (const [id, session] of sessions) {
    if (session.isIdle() || session.isStale()) {
      await session.shutdown();
      sessions.delete(id);
    }
  }
}

export async function addACPManagerConnection({
  config,
  probes,
  configs,
  logger,
  cwd,
  eventBus,
  createProbe = (connectionConfig, probeLogger, probeCwd) =>
    new ACPProbe(connectionConfig, probeLogger, probeCwd),
  removeConnection,
}: {
  config: ACPConnectionConfig;
  probes: Map<string, ACPProbeLike>;
  configs: Map<string, ACPConnectionConfig>;
  logger: any;
  cwd: string;
  eventBus?: EventBus;
  createProbe?: (
    config: ACPConnectionConfig,
    logger: any,
    cwd: string,
  ) => ACPProbeLike;
  removeConnection: (id: string) => Promise<void>;
}): Promise<boolean> {
  if (probes.has(config.id)) {
    await removeConnection(config.id);
  }

  configs.set(config.id, config);
  const probe = createProbe(config, logger, cwd);
  probes.set(config.id, probe);
  const ok = await probe.probe();
  if (ok) {
    eventBus?.emit('agents:changed');
  }
  return ok;
}

export async function removeACPManagerConnection({
  id,
  probes,
  configs,
  sessions,
}: {
  id: string;
  probes: Map<string, ACPProbeLike>;
  configs: Map<string, ACPConnectionConfig>;
  sessions: Map<string, ACPConnectionLike>;
}): Promise<void> {
  probes.delete(id);
  configs.delete(id);
  for (const [conversationId, session] of sessions) {
    if (session.config.id === id) {
      await session.shutdown();
      sessions.delete(conversationId);
    }
  }
}

export async function reconnectACPManagerConnection({
  id,
  probes,
  eventBus,
}: {
  id: string;
  probes: Map<string, ACPProbeLike>;
  eventBus?: EventBus;
}): Promise<boolean> {
  const probe = probes.get(id);
  if (!probe) return false;

  const ok = await probe.probe();
  if (ok) {
    eventBus?.emit('agents:changed');
  }
  return ok;
}

export async function shutdownACPManager({
  probeTimer,
  cullTimer,
  sessions,
  probes,
  configs,
}: {
  probeTimer: ReturnType<typeof setInterval> | null;
  cullTimer: ReturnType<typeof setInterval> | null;
  sessions: Map<string, ACPConnectionLike>;
  probes: Map<string, ACPProbeLike>;
  configs: Map<string, ACPConnectionConfig>;
}): Promise<{
  probeTimer: ReturnType<typeof setInterval> | null;
  cullTimer: ReturnType<typeof setInterval> | null;
}> {
  if (probeTimer) {
    clearInterval(probeTimer);
  }
  if (cullTimer) {
    clearInterval(cullTimer);
  }

  await Promise.all(
    Array.from(sessions.values()).map((session) => session.shutdown()),
  );
  sessions.clear();
  probes.clear();
  configs.clear();

  return {
    probeTimer: null,
    cullTimer: null,
  };
}

export function getOrCreateACPManagerSession({
  configId,
  configs,
  sessions,
  options,
  context,
  createSession,
}: {
  configId: string;
  configs: Map<string, ACPConnectionConfig>;
  sessions: Map<string, ACPConnectionLike>;
  options: { conversationId?: string };
  context?: { cwd?: string; conversationId?: string };
  createSession: (args: {
    config: ACPConnectionConfig;
    conversationId: string;
    cwd: string;
  }) => ACPConnectionLike;
}): { conversationId: string; session: ACPConnectionLike } {
  const conversationId =
    context?.conversationId ||
    options.conversationId ||
    `anon:${Date.now()}:${Math.random().toString(36).slice(2, 11)}`;
  const sessionCwd = context?.cwd || homedir();

  let session = sessions.get(conversationId);
  if (!session) {
    const config = configs.get(configId);
    if (!config) {
      throw new Error(`Missing ACP config for ${configId}`);
    }
    session = createSession({
      config,
      conversationId,
      cwd: sessionCwd,
    });
    sessions.set(conversationId, session);
  }

  return { conversationId, session };
}
