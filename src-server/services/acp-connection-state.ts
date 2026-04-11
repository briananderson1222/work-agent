import type { ChildProcess } from 'node:child_process';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import { approvalOps } from '../telemetry/metrics.js';
import type { ACPBridgeEventState } from './acp-bridge-events.js';
import { forceKillProcess } from './process-utils.js';

export function flushACPTextPart(
  responseAccumulator: string,
  responseParts: Array<{ type: string; [key: string]: any }>,
): {
  responseAccumulator: string;
  responseParts: Array<{ type: string; [key: string]: any }>;
} {
  if (!responseAccumulator) {
    return { responseAccumulator, responseParts };
  }

  return {
    responseAccumulator: '',
    responseParts: [
      ...responseParts,
      { type: 'text', text: responseAccumulator },
    ],
  };
}

export function updateACPToolResultState(
  responseParts: Array<{ type: string; [key: string]: any }>,
  toolCallId: string,
  result: string | undefined,
  isError = false,
): Array<{ type: string; [key: string]: any }> {
  const matched = responseParts.some(
    (part) => part.type === 'tool-invocation' && part.toolCallId === toolCallId,
  );
  if (!matched) {
    return [
      ...responseParts,
      {
        type: 'tool-result',
        toolCallId,
        result,
        isError,
      },
    ];
  }

  return responseParts.map((part) =>
    part.type === 'tool-invocation' && part.toolCallId === toolCallId
      ? {
          ...part,
          state: isError ? 'error' : 'result',
          result,
        }
      : part,
  );
}

export function getOrCreateACPAdapter({
  slug,
  memoryAdapters,
  createMemoryAdapter,
}: {
  slug: string;
  memoryAdapters?: Map<string, FileMemoryAdapter>;
  createMemoryAdapter?: (slug: string) => FileMemoryAdapter;
}): FileMemoryAdapter | null {
  if (!memoryAdapters || !createMemoryAdapter) return null;
  let adapter = memoryAdapters.get(slug);
  if (!adapter) {
    adapter = createMemoryAdapter(slug);
    memoryAdapters.set(slug, adapter);
  }
  return adapter;
}

export function syncACPEventState(
  state: ACPBridgeEventState,
): Pick<
  ACPBridgeEventState,
  | 'responseAccumulator'
  | 'responseParts'
  | 'currentModeId'
  | 'configOptions'
  | 'slashCommands'
  | 'mcpServers'
> {
  return {
    responseAccumulator: state.responseAccumulator,
    responseParts: state.responseParts,
    currentModeId: state.currentModeId,
    configOptions: state.configOptions,
    slashCommands: state.slashCommands,
    mcpServers: state.mcpServers,
  };
}

export function cleanupACPConnectionState({
  approvalRegistry,
  logger,
  prefix,
  terminals,
  proc,
}: {
  approvalRegistry: { cancelAll(): number };
  logger: { info(message: string, meta?: Record<string, unknown>): void };
  prefix: string;
  terminals: Map<string, { process: { kill(): void } }>;
  proc: ChildProcess | null;
}): {
  proc: null;
  connection: null;
  sessionId: null;
  modes: [];
  slashCommands: [];
  mcpServers: [];
  configOptions: [];
  currentModeId: null;
} {
  const cancelled = approvalRegistry.cancelAll();
  if (cancelled > 0) {
    logger.info(
      `[ACP:${prefix}] Cancelled ${cancelled} pending approvals on cleanup`,
    );
    approvalOps.add(cancelled, { operation: 'cancel-cleanup' });
  }

  for (const [, terminal] of Array.from(terminals)) {
    terminal.process.kill();
  }
  terminals.clear();

  if (proc) {
    forceKillProcess(proc).catch(() => {});
  }

  return {
    proc: null,
    connection: null,
    sessionId: null,
    modes: [],
    slashCommands: [],
    mcpServers: [],
    configOptions: [],
    currentModeId: null,
  };
}
