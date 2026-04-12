import crypto from 'node:crypto';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';
import { adapterTurnDuration, providerOps } from '../../telemetry/metrics.js';
import {
  deriveToolArguments,
  deriveToolName,
  deriveToolOutput,
  extractNumber,
  extractString,
  extractToolError,
  extractToolStatus,
  isRecord,
  mapSessionStatus,
  mapThreadStatusToState,
  mapToolCompletionStatus,
  mapTurnFinishReason,
} from './codex-adapter-events.js';
import type { CodexSessionRecord } from './codex-adapter-types.js';

interface CodexAdapterNotification {
  method: string;
  params?: unknown;
}

interface HandleCodexNotificationOptions {
  notification: CodexAdapterNotification;
  nowIso: () => string;
  publish: (event: CanonicalRuntimeEvent) => void;
  record?: CodexSessionRecord;
}

export function handleCodexNotification(
  options: HandleCodexNotificationOptions,
): void {
  const { notification, nowIso, publish, record } = options;
  if (!record) {
    return;
  }

  switch (notification.method) {
    case 'thread/status/changed': {
      if (!isRecord(notification.params)) return;
      const nextState = mapThreadStatusToState(notification.params.status);
      if (record.lastSessionState === nextState) return;
      const previousState = record.lastSessionState;
      record.lastSessionState = nextState;
      record.session = {
        ...record.session,
        status: mapSessionStatus(nextState),
        updatedAt: nowIso(),
      };
      publish({
        eventId: crypto.randomUUID(),
        provider: 'codex',
        threadId: record.externalThreadId,
        createdAt: nowIso(),
        method: 'session.state-changed',
        sessionId: record.externalThreadId,
        from:
          previousState === 'running'
            ? 'running'
            : previousState === 'errored'
              ? 'errored'
              : 'idle',
        to:
          nextState === 'running'
            ? 'running'
            : nextState === 'errored'
              ? 'errored'
              : 'idle',
      });
      return;
    }
    case 'item/agentMessage/delta': {
      if (!isRecord(notification.params)) return;
      const turnId = extractString(notification.params.turnId);
      const itemId = extractString(notification.params.itemId);
      const delta = extractString(notification.params.delta);
      if (!turnId || !itemId || !delta) return;
      record.turnOutput.set(
        turnId,
        `${record.turnOutput.get(turnId) ?? ''}${delta}`,
      );
      publish({
        eventId: crypto.randomUUID(),
        provider: 'codex',
        threadId: record.externalThreadId,
        createdAt: nowIso(),
        method: 'content.text-delta',
        turnId,
        itemId,
        delta,
      });
      return;
    }
    case 'item/reasoning/textDelta': {
      if (!isRecord(notification.params)) return;
      const turnId = extractString(notification.params.turnId);
      const itemId = extractString(notification.params.itemId);
      const delta = extractString(notification.params.delta);
      if (!turnId || !itemId || !delta) return;
      publish({
        eventId: crypto.randomUUID(),
        provider: 'codex',
        threadId: record.externalThreadId,
        createdAt: nowIso(),
        method: 'content.reasoning-delta',
        turnId,
        itemId,
        delta,
      });
      return;
    }
    case 'thread/tokenUsage/updated': {
      if (
        !isRecord(notification.params) ||
        !isRecord(notification.params.tokenUsage)
      ) {
        return;
      }
      const usage = isRecord(notification.params.tokenUsage.total)
        ? notification.params.tokenUsage.total
        : notification.params.tokenUsage;
      publish({
        eventId: crypto.randomUUID(),
        provider: 'codex',
        threadId: record.externalThreadId,
        createdAt: nowIso(),
        method: 'token-usage.updated',
        turnId: extractString(notification.params.turnId) ?? undefined,
        promptTokens: extractNumber(usage.inputTokens) ?? undefined,
        completionTokens: extractNumber(usage.outputTokens) ?? undefined,
        totalTokens: extractNumber(usage.totalTokens) ?? undefined,
        cacheReadTokens: extractNumber(usage.cachedInputTokens) ?? undefined,
      });
      return;
    }
    case 'item/started': {
      handleCodexItemStarted(record, notification.params, nowIso, publish);
      return;
    }
    case 'item/completed': {
      handleCodexItemCompleted(record, notification.params, nowIso, publish);
      return;
    }
    case 'item/commandExecution/outputDelta':
    case 'item/fileChange/outputDelta':
    case 'item/mcpToolCall/progress': {
      if (!isRecord(notification.params)) return;
      const turnId = extractString(notification.params.turnId);
      const itemId = extractString(notification.params.itemId);
      const message =
        extractString(notification.params.delta) ??
        extractString(notification.params.message);
      if (!turnId || !itemId || !message) return;
      publish({
        eventId: crypto.randomUUID(),
        provider: 'codex',
        threadId: record.externalThreadId,
        createdAt: nowIso(),
        method: 'tool.progress',
        turnId,
        itemId,
        toolCallId: itemId,
        message,
      });
      return;
    }
    case 'turn/completed': {
      if (
        !isRecord(notification.params) ||
        !isRecord(notification.params.turn)
      ) {
        return;
      }
      const turnId = extractString(notification.params.turn.id);
      if (!turnId) return;
      const outputText = record.turnOutput.get(turnId);
      publish({
        eventId: crypto.randomUUID(),
        provider: 'codex',
        threadId: record.externalThreadId,
        createdAt: nowIso(),
        method: 'turn.completed',
        turnId,
        finishReason: mapTurnFinishReason(notification.params.turn.status),
        outputText,
      });
      if (record.activeTurnStartedAt) {
        adapterTurnDuration.record(Date.now() - record.activeTurnStartedAt, {
          provider: 'codex',
        });
      }
      record.activeTurnId = undefined;
      record.activeTurnStartedAt = undefined;
      record.session = {
        ...record.session,
        status: 'ready',
        updatedAt: nowIso(),
        resumeCursor: { codexThreadId: record.codexThreadId, turnId },
      };
      providerOps.add(1, {
        operation: 'adapter-turn-complete',
        provider: 'codex',
      });
      return;
    }
    case 'error': {
      if (
        !isRecord(notification.params) ||
        !isRecord(notification.params.error)
      ) {
        return;
      }
      publish({
        eventId: crypto.randomUUID(),
        provider: 'codex',
        threadId: record.externalThreadId,
        createdAt: nowIso(),
        method: 'runtime.error',
        severity: 'error',
        turnId: extractString(notification.params.turnId) ?? undefined,
        message:
          extractString(notification.params.error.message) ??
          'Codex runtime error',
        retriable: Boolean(notification.params.willRetry),
        details: {
          additionalDetails: extractString(
            notification.params.error.additionalDetails,
          ),
        },
      });
      return;
    }
    default:
      return;
  }
}

function handleCodexItemStarted(
  record: CodexSessionRecord,
  params: unknown,
  nowIso: () => string,
  publish: (event: CanonicalRuntimeEvent) => void,
): void {
  if (!isRecord(params) || !isRecord(params.item)) return;
  const turnId = extractString(params.turnId);
  const itemId = extractString(params.item.id);
  const type = extractString(params.item.type);
  if (!turnId || !itemId || !type) return;

  const toolName = deriveToolName(params.item);
  if (!toolName) return;
  record.toolNames.set(itemId, toolName);
  record.toolStarted.add(itemId);
  publish({
    eventId: crypto.randomUUID(),
    provider: 'codex',
    threadId: record.externalThreadId,
    createdAt: nowIso(),
    method: 'tool.started',
    turnId,
    itemId,
    toolCallId: itemId,
    toolName,
    arguments: deriveToolArguments(params.item),
  });
}

function handleCodexItemCompleted(
  record: CodexSessionRecord,
  params: unknown,
  nowIso: () => string,
  publish: (event: CanonicalRuntimeEvent) => void,
): void {
  if (!isRecord(params) || !isRecord(params.item)) return;
  const turnId = extractString(params.turnId);
  const itemId = extractString(params.item.id);
  if (!turnId || !itemId) return;
  const toolName = record.toolNames.get(itemId);
  if (!toolName || !record.toolStarted.has(itemId)) return;
  record.toolStarted.delete(itemId);
  publish({
    eventId: crypto.randomUUID(),
    provider: 'codex',
    threadId: record.externalThreadId,
    createdAt: nowIso(),
    method: 'tool.completed',
    turnId,
    itemId,
    toolCallId: itemId,
    toolName,
    status: mapToolCompletionStatus(extractToolStatus(params.item)),
    output: deriveToolOutput(params.item),
    error: extractToolError(params.item),
  });
}
