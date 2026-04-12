// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { ChatInputArea } from '../components/ChatInputArea';

vi.mock('../components/ConversationStats', () => ({
  ContextPercentage: () => null,
}));

vi.mock('../components/FileAttachmentInput', () => ({
  FileAttachmentInput: () => null,
}));

vi.mock('../components/ModelSelector', () => ({
  ModelSelectorAutocomplete: () => null,
}));

vi.mock('../components/SlashCommandSelector', () => ({
  SlashCommandSelector: () => null,
}));

vi.mock('../components/VoiceOrb', () => ({
  VoiceOrb: () => null,
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      media: '',
      onchange: null,
    })),
  });
});

function renderChatInputArea(overrides: Record<string, unknown> = {}) {
  const props = {
    agentSlug: 'default',
    conversationId: undefined,
    messageCount: 0,
    input: 'hello',
    attachments: [],
    textareaRef: { current: null },
    disabled: false,
    isSending: false,
    hasAbortController: false,
    modelSupportsAttachments: true,
    fontSize: 14,
    dockHeight: 600,
    apiBase: 'http://localhost:3242',
    currentModel: undefined,
    canModelSelect: true,
    agentDefaultModel: 'claude-sonnet',
    availableModels: [{ id: 'claude-sonnet', name: 'Claude Sonnet' }],
    modelQuery: null,
    commandQuery: null,
    slashCommands: [],
    onInputChange: vi.fn(),
    onSend: vi.fn(async () => {}),
    onCancel: vi.fn(),
    onClearInput: vi.fn(),
    onAddAttachments: vi.fn(),
    onRemoveAttachment: vi.fn(),
    onModelSelect: vi.fn(),
    onModelClose: vi.fn(),
    onModelOpen: vi.fn(),
    onCommandSelect: vi.fn(async () => {}),
    onCommandClose: vi.fn(),
    onHistoryUp: vi.fn(),
    onHistoryDown: vi.fn(),
    onShowStats: vi.fn(),
    updateFromInput: vi.fn(),
    closeAll: vi.fn(),
    ...overrides,
  } as const;

  render(<ChatInputArea {...props} />);
  return props;
}

describe('ChatInputArea', () => {
  test('disables the model button when model selection is unavailable', () => {
    renderChatInputArea({
      canModelSelect: false,
    });

    expect(
      (
        screen.getByRole('button', {
          name: 'Default Model',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test('opens the model picker when model selection is available', () => {
    const props = renderChatInputArea();

    fireEvent.click(screen.getByRole('button', { name: 'Default Model' }));

    expect(props.onModelOpen).toHaveBeenCalled();
  });
});
