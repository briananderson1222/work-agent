import type { ClientSideConnection } from '@agentclientprotocol/sdk';
import type { FileMemoryAdapter } from '../adapters/file/memory-adapter.js';
import {
  createACPConversationTitle,
  resolveACPChatSession,
} from './acp-chat-session.js';
import type {
  ConfigOption,
  ConversationMessage,
} from './acp-bridge-types.js';

interface ACPChatPreparationLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void;
}

interface PrepareACPChatTurnOptions {
  adapter: FileMemoryAdapter | null;
  baseCwd: string;
  connection: ClientSideConnection;
  context?: { cwd?: string };
  currentModeId: string | null;
  logger: ACPChatPreparationLogger;
  options: Record<string, any>;
  prefix: string;
  resolvedAlias: string;
  sessionId: string;
  sessionMap: Map<string, string>;
  slug: string;
  input: any;
  configOptions: ConfigOption[];
}

interface PreparedACPChatTurn {
  adapter: FileMemoryAdapter | null;
  configOptions: ConfigOption[];
  conversationId: string;
  currentModeId: string | null;
  inputText: string;
  isNewConversation: boolean;
  promptContent: any[];
  userId: string;
}

export function resolveACPRequestedModeId(prefix: string, slug: string): string {
  return slug.replace(`${prefix}-`, '');
}

export function findACPModelConfigToUpdate(
  configOptions: ConfigOption[],
  requestedModel: string | undefined,
): { configId: string; value: string } | null {
  if (!requestedModel) {
    return null;
  }

  const modelConfig = configOptions.find((option: any) => option.category === 'model') as
    | (ConfigOption & { id?: string })
    | undefined;
  if (!modelConfig || modelConfig.currentValue === requestedModel || !modelConfig.id) {
    return null;
  }

  return {
    configId: modelConfig.id,
    value: requestedModel,
  };
}

export async function prepareACPChatTurn(
  options: PrepareACPChatTurnOptions,
): Promise<PreparedACPChatTurn> {
  const modeId = resolveACPRequestedModeId(options.prefix, options.slug);
  if (modeId !== options.currentModeId) {
    await options.connection.setSessionMode({
      sessionId: options.sessionId,
      modeId,
    });
  }

  let nextConfigOptions = options.configOptions;
  const modelSelection = findACPModelConfigToUpdate(
    options.configOptions,
    options.options.model,
  );
  if (modelSelection) {
    try {
      const result = await options.connection.setSessionConfigOption({
        sessionId: options.sessionId,
        configId: modelSelection.configId,
        value: modelSelection.value,
      });
      nextConfigOptions = (result as any).configOptions || nextConfigOptions;
    } catch (error: any) {
      options.logger.warn('[ACPBridge] Failed to set model', {
        model: options.options.model,
        error: error.message,
      });
    }
  }

  const {
    userId,
    isNewConversation,
    conversationId,
    inputText,
    promptContent,
  } = resolveACPChatSession({
    slug: options.slug,
    input: options.input,
    options: options.options,
    context: options.context,
    baseCwd: options.baseCwd,
    resolvedAlias: options.resolvedAlias,
  });

  if (options.adapter && isNewConversation) {
    await options.adapter.createConversation({
      id: conversationId,
      resourceId: options.slug,
      userId,
      title: createACPConversationTitle(inputText, options.options.title),
      metadata: { acpSessionId: options.sessionId },
    });
    options.sessionMap.set(conversationId, options.sessionId);
  }

  if (options.adapter) {
    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: inputText }],
    };
    await options.adapter.addMessage(
      userMessage as unknown as any,
      userId,
      conversationId,
    );
  }

  return {
    adapter: options.adapter,
    configOptions: nextConfigOptions,
    conversationId,
    currentModeId: modeId,
    inputText,
    isNewConversation,
    promptContent,
    userId,
  };
}
