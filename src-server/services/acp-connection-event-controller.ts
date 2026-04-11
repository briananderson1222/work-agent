import type { SessionNotification } from '@agentclientprotocol/sdk';
import {
  applyACPConnectionEventStateFields,
  flushACPConnectionTextPart,
  getACPConnectionEventStateFields,
  updateACPConnectionToolResult,
  type ACPConnectionEventState,
} from './acp-connection-event-state.js';
import {
  handleACPConnectionExtensionMethod,
  handleACPConnectionExtensionNotification,
  handleACPConnectionSessionUpdate,
  type ACPConnectionEventFields,
} from './acp-connection-events.js';

export interface ACPConnectionEventController {
  getFields(): ACPConnectionEventFields;
  applyFields(fields: ACPConnectionEventFields): void;
  flushTextPart(): void;
  updateToolResult(
    toolCallId: string,
    result: string | undefined,
    isError?: boolean,
  ): void;
}

export function createACPConnectionEventController(options: {
  getState: () => ACPConnectionEventState;
  setState: (state: ACPConnectionEventState) => void;
}): ACPConnectionEventController {
  return {
    getFields() {
      return getACPConnectionEventStateFields(options.getState());
    },
    applyFields(fields) {
      options.setState(
        applyACPConnectionEventStateFields(options.getState(), fields),
      );
    },
    flushTextPart() {
      options.setState(flushACPConnectionTextPart(options.getState()));
    },
    updateToolResult(toolCallId, result, isError = false) {
      options.setState(
        updateACPConnectionToolResult(
          options.getState(),
          toolCallId,
          result,
          isError,
        ),
      );
    },
  };
}

export async function runACPConnectionSessionUpdate(
  params: SessionNotification,
  options: {
    logger: any;
    controller: ACPConnectionEventController;
  },
): Promise<void> {
  await handleACPConnectionSessionUpdate(params, {
    logger: options.logger,
    fields: options.controller.getFields(),
    applyFields: (fields) => options.controller.applyFields(fields),
    flushTextPart: () => options.controller.flushTextPart(),
    updateToolResult: (toolCallId, result, isError) =>
      options.controller.updateToolResult(toolCallId, result, isError),
  });
}

export function runACPConnectionExtensionNotification(
  method: string,
  params: Record<string, unknown>,
  options: {
    logger: any;
    controller: ACPConnectionEventController;
  },
): void {
  handleACPConnectionExtensionNotification(method, params, {
    logger: options.logger,
    fields: options.controller.getFields(),
    applyFields: (fields) => options.controller.applyFields(fields),
  });
}

export function runACPConnectionExtensionMethod(
  method: string,
  params: Record<string, unknown>,
  options: {
    logger: any;
    controller: ACPConnectionEventController;
  },
): Record<string, unknown> {
  return handleACPConnectionExtensionMethod(method, params, {
    logger: options.logger,
    fields: options.controller.getFields(),
    applyFields: (fields) => options.controller.applyFields(fields),
  });
}
