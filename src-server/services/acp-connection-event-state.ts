import type { ACPConnectionEventFields } from './acp-connection-events.js';
import {
  flushACPTextPart,
  updateACPToolResultState,
} from './acp-connection-state.js';

export interface ACPConnectionEventState {
  activeWriter: ((chunk: any) => Promise<void>) | null;
  responseAccumulator: string;
  responseParts: Array<{ type: string; [key: string]: any }>;
  currentModeId: string | null;
  configOptions: any[];
  slashCommands: any[];
  mcpServers: string[];
}

export function getACPConnectionEventStateFields(
  state: ACPConnectionEventState,
): ACPConnectionEventFields {
  return {
    activeWriter: state.activeWriter,
    responseAccumulator: state.responseAccumulator,
    responseParts: state.responseParts,
    currentModeId: state.currentModeId,
    configOptions: state.configOptions,
    slashCommands: state.slashCommands,
    mcpServers: state.mcpServers,
  };
}

export function applyACPConnectionEventStateFields(
  state: ACPConnectionEventState,
  fields: ACPConnectionEventFields,
): ACPConnectionEventState {
  return {
    ...state,
    activeWriter: fields.activeWriter,
    responseAccumulator: fields.responseAccumulator,
    responseParts: fields.responseParts,
    currentModeId: fields.currentModeId,
    configOptions: fields.configOptions,
    slashCommands: fields.slashCommands,
    mcpServers: fields.mcpServers,
  };
}

export function flushACPConnectionTextPart(
  state: ACPConnectionEventState,
): ACPConnectionEventState {
  const next = flushACPTextPart(state.responseAccumulator, state.responseParts);
  return {
    ...state,
    responseAccumulator: next.responseAccumulator,
    responseParts: next.responseParts,
  };
}

export function updateACPConnectionToolResult(
  state: ACPConnectionEventState,
  toolCallId: string,
  result: string | undefined,
  isError = false,
): ACPConnectionEventState {
  return {
    ...state,
    responseParts: updateACPToolResultState(
      state.responseParts,
      toolCallId,
      result,
      isError,
    ),
  };
}
