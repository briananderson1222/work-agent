import React from 'react';
import type { SlashCommand } from '../hooks/useSlashCommands';
import type { STTState as VoiceState } from '@stallion-ai/sdk';
import type { FileAttachment } from '../types';
import { ContextPercentage } from './ConversationStats';
import { FileAttachmentInput } from './FileAttachmentInput';
import { ModelSelectorAutocomplete } from './ModelSelector';
import { SlashCommandSelector } from './SlashCommandSelector';
import { VoiceOrb } from './VoiceOrb';

interface Model {
  id: string;
  name: string;
}

interface ChatInputAreaProps {
  // Session info
  agentSlug: string;
  conversationId?: string;
  messageCount: number;
  // Input state
  input: string;
  attachments: FileAttachment[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  // Status
  disabled: boolean;
  isSending: boolean;
  hasAbortController: boolean;
  modelSupportsAttachments: boolean;
  // Display
  fontSize: number;
  dockHeight: number;
  apiBase: string;
  // Model selector
  currentModel?: string;
  agentDefaultModel?: string;
  availableModels: Model[];
  modelQuery: string | null;
  // Slash commands
  commandQuery: string | null;
  slashCommands: SlashCommand[];
  // Handlers
  onInputChange: (value: string) => void;
  onSend: () => Promise<void>;
  onCancel: () => void;
  onClearInput: () => void;
  onAddAttachments: (files: FileAttachment[]) => void;
  onRemoveAttachment: (id: string) => void;
  onModelSelect: (model: Model) => void;
  onModelClose: () => void;
  onModelOpen: () => void;
  onCommandSelect: (command: SlashCommand) => Promise<void>;
  onCommandClose: () => void;
  onHistoryUp: () => void;
  onHistoryDown: () => void;
  onShowStats: () => void;
  updateFromInput: (value: string) => void;
  closeAll: () => void;
  // Voice mode (optional — omit to hide the mic button)
  voiceState?: VoiceState;
  voiceSupported?: boolean;
  onVoiceStart?: () => void;
  onVoiceStop?: () => void;
}

export function ChatInputArea({
  agentSlug,
  conversationId,
  messageCount,
  input,
  attachments,
  textareaRef,
  disabled,
  isSending,
  hasAbortController,
  modelSupportsAttachments,
  fontSize,
  dockHeight,
  apiBase,
  currentModel,
  agentDefaultModel,
  availableModels,
  modelQuery,
  commandQuery,
  slashCommands,
  onInputChange,
  onSend,
  onCancel,
  onClearInput,
  onAddAttachments,
  onRemoveAttachment,
  onModelSelect,
  onModelClose,
  onModelOpen,
  onCommandSelect,
  onCommandClose,
  onHistoryUp,
  onHistoryDown,
  onShowStats,
  updateFromInput,
  closeAll,
  voiceState,
  voiceSupported,
  onVoiceStart,
  onVoiceStop,
}: ChatInputAreaProps) {
  const isOverride = currentModel && currentModel !== agentDefaultModel;
  const modelInfo = availableModels.find((m) => m.id === currentModel);

  return (
    <div
      className="chat-input"
      style={{ display: 'flex', alignItems: 'stretch' }}
    >
      <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
        {modelQuery !== null && (
          <ModelSelectorAutocomplete
            query={modelQuery}
            models={availableModels}
            currentModel={currentModel}
            agentDefaultModel={agentDefaultModel}
            maxHeight={`calc(${dockHeight}px - 200px)`}
            onSelect={onModelSelect}
            onClose={onModelClose}
          />
        )}
        {commandQuery !== null && (
          <SlashCommandSelector
            query={commandQuery}
            commands={slashCommands}
            maxHeight={`calc(${dockHeight}px - 200px)`}
            onSelect={onCommandSelect}
            onClose={onCommandClose}
          />
        )}
        <textarea
          ref={textareaRef}
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
          value={input}
          disabled={disabled}
          tabIndex={0}
          onFocus={() => updateFromInput(input)}
          onBlur={() => closeAll()}
          onChange={(e) => {
            onInputChange(e.target.value);
            updateFromInput(e.target.value);
          }}
          onKeyDown={async (e) => {
            if (e.defaultPrevented) return;

            if (
              e.key === 'Escape' &&
              (commandQuery !== null || modelQuery !== null)
            ) {
              e.preventDefault();
              closeAll();
              return;
            }

            if (e.key === 'Tab' && !e.shiftKey) return;

            if (e.key === 'ArrowUp') {
              e.preventDefault();
              onHistoryUp();
              return;
            }

            if (e.key === 'ArrowDown') {
              e.preventDefault();
              onHistoryDown();
              return;
            }

            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (input.trim()) await onSend();
            }
          }}
          style={{
            fontSize: `${fontSize}px`,
            flex: 1,
            resize: 'none',
            minHeight: 0,
          }}
        />
        {input && (
          <button
            onClick={onClearInput}
            style={{
              position: 'absolute',
              right: '20px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              color: 'var(--text-muted)',
              padding: '4px',
              lineHeight: '1',
              zIndex: 1,
            }}
            title="Clear input"
          >
            ×
          </button>
        )}
      </div>
      <div className="chat-controls">
        <div className="chat-controls-row">
          {voiceSupported && voiceState !== undefined && onVoiceStart && onVoiceStop && (
            <VoiceOrb
              state={voiceState}
              supported={voiceSupported}
              disabled={disabled || isSending}
              onStart={onVoiceStart}
              onStop={onVoiceStop}
            />
          )}
          <FileAttachmentInput
            attachments={attachments}
            onAdd={onAddAttachments}
            onRemove={onRemoveAttachment}
            disabled={disabled || isSending || !modelSupportsAttachments}
            supportsImages={modelSupportsAttachments}
            supportsFiles={modelSupportsAttachments}
          />
          {hasAbortController ? (
            <button
              onClick={onCancel}
              tabIndex={0}
              className="send-button"
              style={{
                background: 'var(--error-bg)',
                padding: 0,
                border: '1px solid var(--error-border)',
                color: 'var(--error-text)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                flex: '0 0 75%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={async () => {
                if (input.trim() || attachments.length > 0) await onSend();
              }}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  (input.trim() || attachments.length > 0)
                ) {
                  e.preventDefault();
                  onSend();
                }
              }}
              disabled={!input.trim() && attachments.length === 0}
              tabIndex={0}
              className="send-button"
              style={{
                padding: 0,
                border: 'none',
                background:
                  input.trim() || attachments.length > 0
                    ? 'var(--color-primary)'
                    : 'var(--bg-tertiary)',
                color:
                  input.trim() || attachments.length > 0
                    ? 'white'
                    : 'var(--text-muted)',
                cursor:
                  input.trim() || attachments.length > 0
                    ? 'pointer'
                    : 'not-allowed',
                fontSize: '13px',
                fontWeight: 500,
                opacity: input.trim() || attachments.length > 0 ? 1 : 0.25,
                flex: '0 0 75%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Send
            </button>
          )}
        </div>
        <button
          onClick={onModelOpen}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isOverride
              ? 'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.25)'
              : 'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isOverride
              ? 'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.12)'
              : 'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.08)';
          }}
          style={{
            fontSize: '10px',
            color: isOverride ? 'var(--accent-yellow)' : 'var(--text-muted)',
            padding: '4px 8px',
            textAlign: 'center',
            cursor: 'pointer',
            fontWeight: isOverride ? 600 : 400,
            border: 'none',
            width: '100%',
            background: isOverride
              ? 'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.12)'
              : 'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.08)',
            transition: 'background 0.2s',
          }}
          title={
            isOverride
              ? 'Model override active - click to change'
              : 'Click to change model'
          }
        >
          {modelInfo?.name || 'Default Model'}
        </button>
        {conversationId && (
          <ContextPercentage
            agentSlug={agentSlug}
            conversationId={conversationId}
            apiBase={apiBase}
            messageCount={messageCount}
            onClick={onShowStats}
          />
        )}
      </div>
    </div>
  );
}
