import type { SessionNotification } from '@agentclientprotocol/sdk';
import {
  type ACPConnectionEventState,
  applyACPConnectionEventStateFields,
  flushACPConnectionTextPart,
  getACPConnectionEventStateFields,
  updateACPConnectionToolResult,
} from './acp-connection-event-state.js';
import {
  type ACPConnectionEventFields,
  handleACPConnectionExtensionMethod,
  handleACPConnectionExtensionNotification,
  handleACPConnectionSessionUpdate,
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

function runWithControllerFields<T>(
  controller: ACPConnectionEventController,
  run: (options: {
    fields: ACPConnectionEventFields;
    applyFields: (fields: ACPConnectionEventFields) => void;
  }) => T,
): T {
  let fields = controller.getFields();
  const result = run({
    fields,
    applyFields: (nextFields) => {
      fields = nextFields;
    },
  });
  controller.applyFields(fields);
  return result;
}

async function runWithControllerFieldsAsync<T>(
  controller: ACPConnectionEventController,
  run: (options: {
    fields: ACPConnectionEventFields;
    applyFields: (fields: ACPConnectionEventFields) => void;
  }) => Promise<T>,
): Promise<T> {
  let fields = controller.getFields();
  const result = await run({
    fields,
    applyFields: (nextFields) => {
      fields = nextFields;
    },
  });
  controller.applyFields(fields);
  return result;
}

export async function runACPConnectionSessionUpdate(
  params: SessionNotification,
  options: {
    logger: any;
    controller: ACPConnectionEventController;
  },
): Promise<void> {
  await runWithControllerFieldsAsync(options.controller, (controllerState) =>
    handleACPConnectionSessionUpdate(params, {
      logger: options.logger,
      ...controllerState,
    }),
  );
}

export function runACPConnectionExtensionNotification(
  method: string,
  params: Record<string, unknown>,
  options: {
    logger: any;
    controller: ACPConnectionEventController;
  },
): void {
  runWithControllerFields(options.controller, (controllerState) =>
    handleACPConnectionExtensionNotification(method, params, {
      logger: options.logger,
      ...controllerState,
    }),
  );
}

export function runACPConnectionExtensionMethod(
  method: string,
  params: Record<string, unknown>,
  options: {
    logger: any;
    controller: ACPConnectionEventController;
  },
): Record<string, unknown> {
  return runWithControllerFields(options.controller, (controllerState) =>
    handleACPConnectionExtensionMethod(method, params, {
      logger: options.logger,
      ...controllerState,
    }),
  );
}
