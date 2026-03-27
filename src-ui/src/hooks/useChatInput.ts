import { useCallback, useRef, useState } from 'react';
import {
  useActiveChatActions,
  useActiveChatState,
  useCancelMessage,
  useSendMessage,
} from '../contexts/ActiveChatsContext';
import { useToast } from '../contexts/ToastContext';
import type { FileAttachment } from '../types';
import { useAutocompleteState } from './useAutocompleteState';
import { useSlashCommandHandler } from './useSlashCommandHandler';
import type { SlashCommand } from './useSlashCommands';
import { useSlashCommands } from './useSlashCommands';

interface Model {
  id: string;
  name: string;
}

interface UseChatInputOptions {
  apiBase: string;
  sessionId: string | null;
  agentSlug: string | null;
  conversationId?: string;
  availableModels: Model[];
  agentDefaultModel?: string;
  onSessionMigrate?: (newSessionId: string) => void;
  onAuthError?: () => void;
  onOpenNewChat?: () => void;
}

export function useChatInput({
  apiBase,
  sessionId,
  agentSlug,
  conversationId,
  availableModels: _availableModels,
  agentDefaultModel,
  onSessionMigrate,
  onAuthError,
  onOpenNewChat,
}: UseChatInputOptions) {
  const { showToast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Autocomplete state
  const {
    commandQuery,
    modelQuery,
    updateFromInput,
    closeCommand,
    closeModel,
    openModel,
    closeAll,
    onInputCleared,
  } = useAutocompleteState();

  // History navigation index
  const [, setHistoryIndex] = useState<Map<string, number>>(new Map());

  // Get actions from context
  const {
    updateChat,
    clearInput,
    addEphemeralMessage,
    addToInputHistory,
    navigateHistoryUp,
    navigateHistoryDown,
  } = useActiveChatActions();
  const activeChatState = useActiveChatState(sessionId || '');
  const cancelMessage = useCancelMessage();

  // Slash commands
  const { commands: slashCommands } = useSlashCommands(agentSlug);
  const handleSlashCommand = useSlashCommandHandler();

  // Wrap slash command handler
  const slashCommandHandler = useCallback(
    async (sid: string, command: string) => {
      return handleSlashCommand(sid, command, {
        onInputCleared,
        autocomplete: { openModel, openNewChat: onOpenNewChat || (() => {}), closeCommand, closeAll },
      });
    },
    [handleSlashCommand, openModel, onOpenNewChat, closeCommand, closeAll, onInputCleared],
  );

  // Send message
  const sendMessageAction = useSendMessage(
    apiBase,
    (newSessionId) => onSessionMigrate?.(newSessionId),
    (error) => {
      if (error.message.includes('401')) {
        onAuthError?.();
      } else {
        showToast(`Error: ${error.message}`, 'error');
      }
    },
    slashCommandHandler,
  );

  // Input value
  const input = activeChatState?.input || '';
  const attachments = activeChatState?.attachments || [];
  const currentModel = activeChatState?.model;

  // Handlers
  const handleInputChange = useCallback(
    (value: string) => {
      if (!sessionId) return;
      // Strip [SYSTEM_EVENT] prefix
      const cleanValue = value.replace(/\[SYSTEM_EVENT\]\s*/g, '');
      updateChat(sessionId, { input: cleanValue });
      setHistoryIndex((prev) => new Map(prev).set(sessionId, -1));
    },
    [sessionId, updateChat],
  );

  const handleSend = useCallback(async () => {
    if (!sessionId || !agentSlug) return;
    if (!input.trim() && attachments.length === 0) return;

    if (input.trim()) {
      addToInputHistory(sessionId, input.trim());
      setHistoryIndex((prev) => new Map(prev).set(sessionId, -1));
    }
    await sendMessageAction(
      sessionId,
      agentSlug,
      conversationId,
      input.trim(),
      attachments,
    );
  }, [
    sessionId,
    agentSlug,
    conversationId,
    input,
    attachments,
    sendMessageAction,
    addToInputHistory,
  ]);

  const handleCancel = useCallback(() => {
    if (!sessionId) return;
    cancelMessage(sessionId);
    addEphemeralMessage(sessionId, {
      role: 'system',
      content: 'User canceled the ongoing request.',
    });
  }, [sessionId, cancelMessage, addEphemeralMessage]);

  const handleClearInput = useCallback(() => {
    if (!sessionId) return;
    clearInput(sessionId);
    onInputCleared();
  }, [sessionId, clearInput, onInputCleared]);

  const handleAddAttachments = useCallback(
    (files: FileAttachment[]) => {
      if (!sessionId) return;
      const existing = attachments;
      updateChat(sessionId, { attachments: [...existing, ...files] });
    },
    [sessionId, attachments, updateChat],
  );

  const handleRemoveAttachment = useCallback(
    (id: string) => {
      if (!sessionId) return;
      const newAttachments = attachments.filter((a) => a.id !== id);
      updateChat(sessionId, { attachments: newAttachments });
    },
    [sessionId, attachments, updateChat],
  );

  const handleModelSelect = useCallback(
    (model: Model) => {
      if (!sessionId) return;
      const agentModelId =
        typeof agentDefaultModel === 'string' ? agentDefaultModel : undefined;
      const currentModelStr = currentModel || agentModelId || '';
      const isAlreadyActive = currentModelStr === model.id;

      updateChat(sessionId, { input: '', model: model.id });

      if (!isAlreadyActive) {
        addEphemeralMessage(sessionId, {
          role: 'system',
          content: `Model changed to **${model.name}**`,
        });
      }
      closeModel();
    },
    [
      sessionId,
      currentModel,
      agentDefaultModel,
      updateChat,
      addEphemeralMessage,
      closeModel,
    ],
  );

  const handleModelOpen = useCallback(() => {
    if (!sessionId) return;
    closeCommand();
    updateChat(sessionId, { input: '/model ' });
    setTimeout(() => openModel(), 0);
    textareaRef.current?.focus();
  }, [sessionId, updateChat, closeCommand, openModel]);

  const handleCommandSelect = useCallback(
    async (command: SlashCommand) => {
      if (!sessionId || !agentSlug) return;
      await sendMessageAction(
        sessionId,
        agentSlug,
        conversationId,
        command.cmd,
      );
      textareaRef.current?.focus();
    },
    [sessionId, agentSlug, conversationId, sendMessageAction],
  );

  const handleHistoryUp = useCallback(() => {
    if (!sessionId) return;
    navigateHistoryUp(sessionId);
  }, [sessionId, navigateHistoryUp]);

  const handleHistoryDown = useCallback(() => {
    if (!sessionId) return;
    navigateHistoryDown(sessionId);
  }, [sessionId, navigateHistoryDown]);

  return {
    // Refs
    textareaRef,
    // State
    input,
    attachments,
    currentModel,
    modelQuery,
    commandQuery,
    slashCommands,
    // Handlers
    handleInputChange,
    handleSend,
    handleCancel,
    handleClearInput,
    handleAddAttachments,
    handleRemoveAttachment,
    handleModelSelect,
    handleModelOpen,
    handleModelClose: closeModel,
    handleCommandSelect,
    handleCommandClose: closeCommand,
    handleHistoryUp,
    handleHistoryDown,
    updateFromInput,
    closeAll,
  };
}
