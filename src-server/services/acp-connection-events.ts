import type {
  Client,
  SessionNotification,
} from '@agentclientprotocol/sdk';
import { createACPBridgeClient } from './acp-bridge-client.js';
import {
  type ACPBridgeEventState,
  handleACPBridgeExtensionMethod,
  handleACPBridgeExtensionNotification,
  handleACPBridgeSessionUpdate,
} from './acp-bridge-events.js';
import { syncACPEventState } from './acp-connection-state.js';
import type {
  ACPSlashCommand,
  ManagedTerminal,
} from './acp-bridge-types.js';

export interface ACPConnectionEventFields {
  activeWriter: ((chunk: any) => Promise<void>) | null;
  responseAccumulator: string;
  responseParts: Array<{ type: string; [key: string]: any }>;
  currentModeId: string | null;
  configOptions: any[];
  slashCommands: ACPSlashCommand[];
  mcpServers: string[];
}

export function buildACPConnectionEventState(
  fields: ACPConnectionEventFields,
): ACPBridgeEventState {
  return {
    activeWriter: fields.activeWriter,
    responseAccumulator: fields.responseAccumulator,
    responseParts: fields.responseParts,
    currentModeId: fields.currentModeId,
    configOptions: fields.configOptions,
    slashCommands: fields.slashCommands,
    mcpServers: fields.mcpServers,
  };
}

export function applyACPConnectionEventState(
  target: ACPConnectionEventFields,
  state: ACPBridgeEventState,
): void {
  const next = syncACPEventState(state);
  target.responseAccumulator = next.responseAccumulator;
  target.responseParts = next.responseParts;
  target.currentModeId = next.currentModeId;
  target.configOptions = next.configOptions;
  target.slashCommands = next.slashCommands;
  target.mcpServers = next.mcpServers;
}

export async function handleACPConnectionSessionUpdate(
  params: SessionNotification,
  options: {
    logger: any;
    fields: ACPConnectionEventFields;
    applyFields: (fields: ACPConnectionEventFields) => void;
    flushTextPart: () => void;
    updateToolResult: (
      toolCallId: string,
      result: string | undefined,
      isError?: boolean,
    ) => void;
  },
): Promise<void> {
  const state = buildACPConnectionEventState(options.fields);
  await handleACPBridgeSessionUpdate(params, {
    logger: options.logger,
    state,
    flushTextPart: options.flushTextPart,
    updateToolResult: options.updateToolResult,
  });
  const nextFields = { ...options.fields };
  applyACPConnectionEventState(nextFields, state);
  options.applyFields(nextFields);
}

export function handleACPConnectionExtensionNotification(
  method: string,
  params: Record<string, unknown>,
  options: {
    logger: any;
    fields: ACPConnectionEventFields;
    applyFields: (fields: ACPConnectionEventFields) => void;
  },
): void {
  const state = buildACPConnectionEventState(options.fields);
  handleACPBridgeExtensionNotification(method, params, {
    logger: options.logger,
    state,
  });
  const nextFields = { ...options.fields };
  applyACPConnectionEventState(nextFields, state);
  options.applyFields(nextFields);
}

export function handleACPConnectionExtensionMethod(
  method: string,
  params: Record<string, unknown>,
  options: {
    logger: any;
    fields: ACPConnectionEventFields;
    applyFields: (fields: ACPConnectionEventFields) => void;
  },
): Record<string, unknown> {
  const state = buildACPConnectionEventState(options.fields);
  const result = handleACPBridgeExtensionMethod(method, params, {
    logger: options.logger,
    state,
  });
  const nextFields = { ...options.fields };
  applyACPConnectionEventState(nextFields, state);
  options.applyFields(nextFields);
  return result;
}

export function createACPConnectionClient(options: {
  cwd: string;
  terminals: Map<string, ManagedTerminal>;
  approvalRegistry: any;
  getActiveWriter: () => ((chunk: any) => Promise<void>) | null;
  nextTerminalId: () => string;
  handleSessionUpdate: (params: SessionNotification) => Promise<void>;
  handleExtNotification: (
    method: string,
    params: Record<string, unknown>,
  ) => void;
  handleExtMethod: (
    method: string,
    params: Record<string, unknown>,
  ) => Record<string, unknown>;
}): Client {
  return createACPBridgeClient({
    cwd: options.cwd,
    terminals: options.terminals,
    approvalRegistry: options.approvalRegistry,
    getActiveWriter: options.getActiveWriter,
    nextTerminalId: options.nextTerminalId,
    onSessionUpdate: options.handleSessionUpdate,
    onExtNotification: options.handleExtNotification,
    onExtMethod: options.handleExtMethod,
  });
}
