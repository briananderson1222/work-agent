import type { Context } from 'hono';
import { getCachedUser } from '../routes/auth.js';
import { prepareACPChatTurn } from './acp-chat-preparation.js';
import { streamACPChatResponse } from './acp-chat-stream.js';

export interface ACPConnectionChatState {
  status: string;
  shuttingDown: boolean;
  connection: any;
  sessionId: string | null;
  currentModeId: string | null;
  configOptions: any[];
  activeWriter: ((chunk: any) => Promise<void>) | null;
  responseAccumulator: string;
  responseParts: Array<{ type: string; [key: string]: any }>;
}

interface HandleACPConnectionChatParams {
  c: Context;
  slug: string;
  input: any;
  options: any;
  context?: { cwd?: string };
  prefix: string;
  cwd: string;
  logger: any;
  sessionMap: Map<string, string>;
  monitoringEmitter?: any;
  monitoringEvents?: import('node:events').EventEmitter;
  persistEvent?: (event: any) => Promise<void>;
  usageAggregatorRef?: { get: () => any };
  getOrCreateAdapter: (slug: string) => any;
  getCurrentModelName: () => string | null;
  updateToolResult: (
    toolCallId: string,
    result: string | undefined,
    isError?: boolean,
  ) => void;
  getState: () => ACPConnectionChatState;
  setPreparedState: (prepared: {
    currentModeId: string | null;
    configOptions: any[];
  }) => void;
  setActiveWriter: (writer: ((chunk: any) => Promise<void>) | null) => void;
  setResponseAccumulator: (value: string) => void;
  setResponseParts: (parts: Array<{ type: string; [key: string]: any }>) => void;
  touchActivity: () => void;
  start: () => Promise<boolean>;
}

export async function handleACPConnectionChat({
  c,
  slug,
  input,
  options,
  context,
  prefix,
  cwd,
  logger,
  sessionMap,
  monitoringEmitter,
  monitoringEvents,
  persistEvent,
  usageAggregatorRef,
  getOrCreateAdapter,
  getCurrentModelName,
  updateToolResult,
  getState,
  setPreparedState,
  setActiveWriter,
  setResponseAccumulator,
  setResponseParts,
  touchActivity,
  start,
}: HandleACPConnectionChatParams): Promise<Response> {
  touchActivity();

  const initialState = getState();
  if (initialState.status === 'disconnected' && !initialState.shuttingDown) {
    logger.info(`[ACP:${prefix}] Auto-restarting culled session`);
    const started = await start();
    if (!started) {
      return c.json({ success: false, error: 'ACP failed to restart' }, 503);
    }
  }

  const state = getState();
  if (!state.connection || !state.sessionId) {
    return c.json({ success: false, error: 'ACP not connected' }, 503);
  }

  const adapter = getOrCreateAdapter(slug);
  const resolvedAlias = getCachedUser().alias;
  const prepared = await prepareACPChatTurn({
    adapter,
    baseCwd: cwd,
    connection: state.connection,
    context,
    currentModeId: state.currentModeId,
    logger,
    options,
    prefix,
    resolvedAlias,
    sessionId: state.sessionId,
    sessionMap,
    slug,
    input,
    configOptions: state.configOptions,
  });
  setPreparedState(prepared);

  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  return streamACPChatResponse(c, {
    adapter,
    connection: state.connection,
    conversationId: prepared.conversationId,
    getActiveWriter: () => getState().activeWriter,
    getCurrentModelName,
    getResponseAccumulator: () => getState().responseAccumulator,
    getResponseParts: () => getState().responseParts,
    input,
    inputText: prepared.inputText,
    isNewConversation: prepared.isNewConversation,
    logger,
    monitoringEmitter,
    monitoringEvents,
    options,
    persistEvent,
    promptContent: prepared.promptContent,
    sessionId: state.sessionId,
    setActiveWriter,
    setResponseAccumulator,
    setResponseParts,
    slug,
    updateToolResult: (toolCallId, result, isError) =>
      updateToolResult(toolCallId, result, isError),
    usageAggregatorRef,
    userId: prepared.userId,
  });
}
