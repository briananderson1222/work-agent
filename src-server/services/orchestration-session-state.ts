import type { OrchestrationSessionSummary } from '@stallion-ai/contracts/orchestration';
import type {
  ProviderKind,
  ProviderSession,
} from '@stallion-ai/contracts/provider';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';
import type { ProviderAdapterShape } from '../providers/adapter-shape.js';
import type { IProviderAdapterRegistry } from '../providers/provider-interfaces.js';
import type { EventStore } from './event-store.js';

export function trackOrchestrationSession(options: {
  threadProviders: Map<string, ProviderKind>;
  sessionReadModel: Map<string, ProviderSession>;
  session: ProviderSession;
}): void {
  options.threadProviders.set(
    options.session.threadId,
    options.session.provider,
  );
  options.sessionReadModel.set(options.session.threadId, options.session);
}

export async function resolveOrchestrationAdapterForThread(options: {
  threadId: string;
  threadProviders: Map<string, ProviderKind>;
  requireAdapter: (provider: ProviderKind) => ProviderAdapterShape;
  adapters: ProviderAdapterShape[];
}): Promise<ProviderAdapterShape> {
  const knownProvider = options.threadProviders.get(options.threadId);
  if (knownProvider) {
    return options.requireAdapter(knownProvider);
  }

  for (const adapter of options.adapters) {
    if (await adapter.hasSession(options.threadId)) {
      options.threadProviders.set(options.threadId, adapter.provider);
      return adapter;
    }
  }

  throw new Error(`No provider session found for thread: ${options.threadId}`);
}

export function projectOrchestrationEventToReadModel(options: {
  event: CanonicalRuntimeEvent;
  threadProviders: Map<string, ProviderKind>;
  sessionReadModel: Map<string, ProviderSession>;
  eventStore?: EventStore;
}): void {
  const { event, threadProviders, sessionReadModel, eventStore } = options;
  const existing = sessionReadModel.get(event.threadId);
  const baseSession: ProviderSession = existing ?? {
    provider: event.provider,
    threadId: event.threadId,
    status: 'ready',
    createdAt: event.createdAt,
    updatedAt: event.createdAt,
  };

  let nextSession: ProviderSession | null = baseSession;

  switch (event.method) {
    case 'session.started':
      nextSession = {
        ...baseSession,
        provider: event.provider,
        status: 'connecting',
        createdAt: baseSession.createdAt ?? event.createdAt,
        updatedAt: event.createdAt,
      };
      break;
    case 'session.configured':
      nextSession = {
        ...baseSession,
        status: baseSession.status === 'closed' ? 'closed' : 'ready',
        model: event.model ?? baseSession.model,
        updatedAt: event.createdAt,
      };
      break;
    case 'session.state-changed':
      nextSession = {
        ...baseSession,
        status: mapOrchestrationSessionState(event.to),
        updatedAt: event.createdAt,
      };
      break;
    case 'session.exited':
      nextSession = {
        ...baseSession,
        status: 'closed',
        updatedAt: event.createdAt,
      };
      break;
    default:
      nextSession = existing
        ? { ...existing, updatedAt: event.createdAt }
        : null;
      break;
  }

  if (!nextSession) return;
  trackOrchestrationSession({
    threadProviders,
    sessionReadModel,
    session: nextSession,
  });
  if (nextSession.status === 'closed') {
    eventStore?.markSessionClosed(nextSession.threadId, nextSession.provider);
    return;
  }
  eventStore?.upsertSession(nextSession);
}

export function buildOrchestrationSessionSummary(options: {
  persisted?: ProviderSession;
  loaded?: ProviderSession;
  events?: CanonicalRuntimeEvent[];
}): OrchestrationSessionSummary {
  const base = options.loaded ?? options.persisted;
  if (!base) {
    throw new Error('A persisted or loaded session is required');
  }

  const events = options.events ?? [];
  const lastEvent = events.at(-1);

  return {
    provider: base.provider,
    threadId: base.threadId,
    status: base.status,
    ...(base.model ? { model: base.model } : {}),
    ...(base.resumeCursor !== undefined
      ? { resumeCursor: base.resumeCursor }
      : {}),
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    isLoaded: Boolean(options.loaded),
    isPersisted: Boolean(options.persisted),
    eventCount: events.length,
    ...(lastEvent
      ? {
          lastEventAt: lastEvent.createdAt,
          lastEventMethod: lastEvent.method,
        }
      : {}),
  };
}

export async function recoverOrchestrationSessions(options: {
  adapterRegistry: IProviderAdapterRegistry;
  eventStore?: EventStore;
  assertAdapterReady: (adapter: ProviderAdapterShape) => Promise<void>;
  trackSession: (session: ProviderSession) => void;
  logger: {
    warn(message: string, meta?: Record<string, unknown>): void;
  };
}): Promise<void> {
  const persistedSessions = options.eventStore?.readSessions() ?? [];
  for (const session of persistedSessions) {
    if (session.status === 'closed') continue;
    const adapter = options.adapterRegistry.get(session.provider);
    if (!adapter) continue;
    try {
      await options.assertAdapterReady(adapter);
    } catch (error) {
      options.logger.warn('Provider session not ready for recovery yet', {
        provider: session.provider,
        threadId: session.threadId,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    try {
      const recovered = await adapter.startSession({
        threadId: session.threadId,
        provider: session.provider,
        modelId: session.model,
        resumeCursor: session.resumeCursor,
      });
      const nextSession = {
        ...recovered,
        createdAt: session.createdAt,
      };
      options.trackSession(nextSession);
      options.eventStore?.upsertSession(nextSession);
    } catch (error) {
      options.logger.warn('Failed to recover provider session', {
        provider: session.provider,
        threadId: session.threadId,
        error: error instanceof Error ? error.message : String(error),
      });
      options.eventStore?.markSessionClosed(session.threadId, session.provider);
    }
  }
}

function mapOrchestrationSessionState(
  state: string,
): ProviderSession['status'] {
  if (state === 'running') return 'running';
  if (state === 'errored') return 'error';
  if (state === 'exited') return 'closed';
  return 'ready';
}
