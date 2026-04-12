import { handleOrchestrationEvent } from './eventHandlers';
import { applyOrchestrationSnapshot } from './snapshotHandlers';
import type { OrchestrationEvent, OrchestrationSnapshotPayload } from './types';

const activeSources = new Map<string, EventSource>();

export function ensureOrchestrationEventStream(apiBase: string) {
  if (activeSources.has(apiBase)) return;
  const source = new EventSource(`${apiBase}/api/orchestration/events`);

  source.addEventListener('orchestration:snapshot', (raw) => {
    const payload = JSON.parse(
      (raw as MessageEvent).data,
    ) as OrchestrationSnapshotPayload;
    applyOrchestrationSnapshot(payload);
  });

  source.addEventListener('orchestration:event', (raw) => {
    const payload = JSON.parse((raw as MessageEvent).data) as {
      event: OrchestrationEvent;
    };
    handleOrchestrationEvent(apiBase, payload.event);
  });

  source.onerror = () => {
    source.close();
    activeSources.delete(apiBase);
    window.setTimeout(() => ensureOrchestrationEventStream(apiBase), 2000);
  };

  activeSources.set(apiBase, source);
}
