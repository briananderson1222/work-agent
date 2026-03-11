import React from 'react';
import type { SlashCommand } from '../hooks/useSlashCommands';
import type { STTState as VoiceState } from '@stallion-ai/sdk';
import type { FileAttachment } from '../types';
import { useFeatureSettings } from '../hooks/useFeatureSettings';
import { ContextPercentage } from './ConversationStats';
import { FileAttachmentInput } from './FileAttachmentInput';
import { ModelSelectorAutocomplete } from './ModelSelector';
import { SlashCommandSelector } from './SlashCommandSelector';
import { VoiceOrb } from './VoiceOrb';
import './chat.css';

interface Model {
  id: string;
  name: string;
  originalId?: string;
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
  const { settings: featureSettings } = useFeatureSettings();

  return (
    <div
      className="chat-input"
      style={{ display: 'flex', alignItems: 'stretch' }}
    >
      <div className="chat-input__textarea-wrapper">
        {modelQuery !== null && (
          <ModelSelectorAutocomplete
            query={modelQuery}
            models={availableModels.map((m) => ({ ...m, originalId: m.originalId || m.id }))}
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
            className="chat-input__clear"
            title="Clear input"
          >
            ×
          </button>
        )}
      </div>
      {featureSettings.voiceInputEnabled && voiceSupported && voiceState !== undefined && onVoiceStart && onVoiceStop && (
        <VoiceOrb
          state={voiceState}
          supported={voiceSupported}
          disabled={disabled || isSending}
          onStart={onVoiceStart}
          onStop={onVoiceStop}
        />
      )}
      <div className="chat-controls">
        <div className="chat-controls-row">
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
              className="send-button chat-input__cancel-btn"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={async () => {
                if (input.trim() || attachments.length > 0) await onSend();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (input.trim() || attachments.length > 0)) {
                  e.preventDefault();
                  onSend();
                }
              }}
              disabled={!input.trim() && attachments.length === 0}
              tabIndex={0}
              className={`send-button chat-input__send-btn ${input.trim() || attachments.length > 0 ? 'chat-input__send-btn--active' : 'chat-input__send-btn--inactive'}`}
            >
              Send
            </button>
          )}
        </div>
        <button
          onClick={onModelOpen}
          className={`chat-input__model-btn ${isOverride ? 'chat-input__model-btn--override' : 'chat-input__model-btn--default'}`}
          title={isOverride ? 'Model override active - click to change' : 'Click to change model'}
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
