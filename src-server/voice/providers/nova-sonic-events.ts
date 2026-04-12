import type { S2SProviderState } from '../s2s-types.js';

export interface NovaSonicEventState {
  currentRole: string;
  currentGenerationStage: string;
  currentToolName: string;
  currentToolUseId: string;
  currentToolContent: string;
  currentContentType: string;
}

interface NovaSonicEventEffects {
  emit: (event: string, payload?: unknown) => void;
  setState: (state: S2SProviderState) => void;
}

export function parseNovaSonicRawEvent(
  raw: any,
  warn: (message: string, error: unknown) => void = console.warn,
): any | null {
  try {
    const bytes = raw.chunk?.bytes;
    if (!bytes) return null;
    return JSON.parse(new TextDecoder().decode(bytes))?.event ?? null;
  } catch (error) {
    warn('[NovaSonic] Failed to parse response chunk:', error);
    return null;
  }
}

export function processNovaSonicStreamEvent(
  event: any,
  state: NovaSonicEventState,
  effects: NovaSonicEventEffects,
): void {
  if (event.completionStart) {
    effects.emit('turnStart');
    effects.setState('processing');
    return;
  }

  if (event.contentStart) {
    const contentStart = event.contentStart;
    state.currentRole = contentStart.role ?? '';
    state.currentGenerationStage = contentStart.additionalModelFields
      ? (JSON.parse(contentStart.additionalModelFields)?.generationStage ?? '')
      : '';
    state.currentContentType = contentStart.type ?? '';
    state.currentToolName = '';
    state.currentToolUseId = '';
    state.currentToolContent = '';
    if (contentStart.type === 'AUDIO') {
      effects.setState('speaking');
    }
    return;
  }

  if (event.textOutput) {
    const text: string = event.textOutput.content ?? '';
    const role = state.currentRole.toLowerCase() as 'user' | 'assistant';
    const stage = state.currentGenerationStage.toLowerCase() as
      | 'speculative'
      | 'final';

    if (role === 'user' && stage === 'final') {
      effects.emit('transcript', { text, role: 'user', stage: 'final' });
    } else if (role === 'assistant' && stage === 'speculative') {
      effects.emit('transcript', {
        text,
        role: 'assistant',
        stage: 'speculative',
      });
    } else if (role === 'assistant' && stage === 'final') {
      effects.emit('transcript', {
        text,
        role: 'assistant',
        stage: 'final',
      });
    }
    return;
  }

  if (event.audioOutput) {
    effects.emit('audio', Buffer.from(event.audioOutput.content, 'base64'));
    return;
  }

  if (event.toolUse) {
    state.currentToolName = event.toolUse.toolName ?? state.currentToolName;
    state.currentToolUseId = event.toolUse.toolUseId ?? state.currentToolUseId;
    state.currentToolContent += event.toolUse.content ?? '';
    return;
  }

  if (event.contentEnd) {
    if (event.contentEnd.stopReason === 'TOOL_USE' && state.currentToolUseId) {
      try {
        effects.emit('toolUse', {
          toolName: state.currentToolName,
          toolUseId: state.currentToolUseId,
          parameters: JSON.parse(state.currentToolContent || '{}'),
        });
      } catch {
        effects.emit('toolUse', {
          toolName: state.currentToolName,
          toolUseId: state.currentToolUseId,
          parameters: {},
        });
      }
    } else if (event.contentEnd.stopReason === 'INTERRUPTED') {
      effects.setState('listening');
    }
    return;
  }

  if (event.completionEnd) {
    effects.emit('turnEnd');
    effects.setState('listening');
  }
}
