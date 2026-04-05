import type { ProviderKind } from '@stallion-ai/contracts/provider';
import type { DockMode } from '../types';
import { Toggle } from './Toggle';

interface ChatSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  chatFontSize: number;
  setChatFontSize: (fn: (prev: number) => number) => void;
  defaultFontSize: number;
  showReasoning: boolean;
  setShowReasoning: (show: boolean) => void;
  showToolDetails: boolean;
  setShowToolDetails: (show: boolean) => void;
  dockMode: DockMode;
  onDockModeChange: (mode: DockMode) => void;
  activeProvider?: ProviderKind;
  activeModel?: string;
  activeProviderOptions?: Record<string, unknown>;
  availableProviders: Array<{
    provider: ProviderKind;
    activeSessions: number;
    prerequisites: Array<{ name: string; status: string }>;
  }>;
  onProviderChange: (provider: ProviderKind) => void;
  onModelChange: (model: string) => void;
  onProviderOptionsChange: (options: Record<string, unknown>) => void;
}

const DOCK_MODE_OPTIONS: { value: DockMode; label: string; desc: string }[] = [
  { value: 'bottom', label: 'Bottom', desc: 'Overlay at bottom' },
  { value: 'right', label: 'Right', desc: 'Side-by-side split' },
  { value: 'bottom-inline', label: 'Inline', desc: 'Inline below content' },
];

export function ChatSettingsPanel({
  isOpen,
  onClose,
  chatFontSize,
  setChatFontSize,
  defaultFontSize,
  showReasoning,
  setShowReasoning,
  showToolDetails,
  setShowToolDetails,
  dockMode,
  onDockModeChange,
  activeProvider = 'bedrock',
  activeModel = '',
  activeProviderOptions = {},
  availableProviders,
  onProviderChange,
  onModelChange,
  onProviderOptionsChange,
}: ChatSettingsPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="chat-settings-overlay" onClick={onClose}>
      <div className="chat-settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="chat-settings-modal__title">Chat Settings</h3>

        <div className="chat-settings-modal__section">
          <label className="chat-settings-modal__label">Provider</label>
          <div className="chat-settings-modal__control">
            <select
              className="editor-input"
              value={activeProvider}
              onChange={(e) => onProviderChange(e.target.value as ProviderKind)}
            >
              {availableProviders.map((provider) => (
                <option key={provider.provider} value={provider.provider}>
                  {provider.provider}
                </option>
              ))}
            </select>
          </div>
          {availableProviders.length > 0 && (
            <p className="chat-settings-modal__hint">
              {availableProviders
                .find((provider) => provider.provider === activeProvider)
                ?.prerequisites.filter((item) => item.status !== 'installed')
                .map((item) => `${item.name}: ${item.status}`)
                .join(' · ') || 'Provider ready'}
            </p>
          )}
        </div>

        <div className="chat-settings-modal__section">
          <label className="chat-settings-modal__label">Model</label>
          <div className="chat-settings-modal__control">
            <input
              className="editor-input"
              value={activeModel}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder={
                activeProvider === 'bedrock'
                  ? 'Use the model picker or enter a model ID'
                  : `Enter a ${activeProvider} model ID`
              }
            />
          </div>
        </div>

        {activeProvider === 'claude' && (
          <div className="chat-settings-modal__section">
            <label className="chat-settings-modal__checkbox">
              <Toggle
                checked={activeProviderOptions.thinking !== false}
                onChange={(thinking) =>
                  onProviderOptionsChange({
                    ...activeProviderOptions,
                    thinking,
                  })
                }
                size="sm"
              />
              <span>Enable thinking</span>
            </label>
            <div className="chat-settings-modal__control">
              <select
                className="editor-input"
                value={String(activeProviderOptions.effort || 'medium')}
                onChange={(e) =>
                  onProviderOptionsChange({
                    ...activeProviderOptions,
                    effort: e.target.value,
                  })
                }
              >
                <option value="low">Low effort</option>
                <option value="medium">Medium effort</option>
                <option value="high">High effort</option>
                <option value="max">Max effort</option>
              </select>
            </div>
          </div>
        )}

        {activeProvider === 'codex' && (
          <div className="chat-settings-modal__section">
            <label className="chat-settings-modal__label">
              Reasoning Effort
            </label>
            <div className="chat-settings-modal__control">
              <select
                className="editor-input"
                value={String(
                  activeProviderOptions.reasoningEffort || 'medium',
                )}
                onChange={(e) =>
                  onProviderOptionsChange({
                    ...activeProviderOptions,
                    reasoningEffort: e.target.value,
                  })
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">XHigh</option>
              </select>
            </div>
            <label className="chat-settings-modal__checkbox">
              <Toggle
                checked={activeProviderOptions.fastMode === true}
                onChange={(fastMode) =>
                  onProviderOptionsChange({
                    ...activeProviderOptions,
                    fastMode,
                  })
                }
                size="sm"
              />
              <span>Fast mode</span>
            </label>
          </div>
        )}

        <div className="chat-settings-modal__section">
          <label className="chat-settings-modal__label">Dock Position</label>
          <div className="chat-settings-modal__control">
            {DOCK_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`chat-settings-modal__btn${dockMode === opt.value ? ' chat-settings-modal__btn--active' : ''}`}
                onClick={() => onDockModeChange(opt.value)}
                title={opt.desc}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="chat-settings-modal__hint">
            Position the chat panel · ⌘⇧D to cycle
          </p>
        </div>

        <div className="chat-settings-modal__section">
          <label className="chat-settings-modal__label">Font Size</label>
          <div className="chat-settings-modal__control">
            <button
              className="chat-settings-modal__btn"
              onClick={() => setChatFontSize((prev) => Math.max(10, prev - 1))}
              disabled={chatFontSize <= 10}
            >
              A−
            </button>
            <button
              className="chat-settings-modal__btn"
              onClick={() => setChatFontSize(() => defaultFontSize)}
              style={{ opacity: chatFontSize === defaultFontSize ? 0.5 : 1 }}
            >
              A
            </button>
            <button
              className="chat-settings-modal__btn"
              onClick={() => setChatFontSize((prev) => Math.min(24, prev + 1))}
              disabled={chatFontSize >= 24}
            >
              A+
            </button>
            <span className="chat-settings-modal__value">
              {chatFontSize}px (
              {Math.round((chatFontSize / defaultFontSize) * 100)}%)
            </span>
          </div>
        </div>

        <div className="chat-settings-modal__section">
          <label className="chat-settings-modal__checkbox">
            <Toggle
              checked={showReasoning}
              onChange={setShowReasoning}
              size="sm"
            />
            <span>Show reasoning</span>
          </label>
          <p className="chat-settings-modal__hint">
            Display model reasoning steps in chat messages
          </p>
        </div>

        <div className="chat-settings-modal__section">
          <label className="chat-settings-modal__checkbox">
            <Toggle
              checked={showToolDetails}
              onChange={setShowToolDetails}
              size="sm"
            />
            <span>Show tool details</span>
          </label>
          <p className="chat-settings-modal__hint">
            Allow expanding tool calls to view arguments and results
          </p>
        </div>

        <div className="chat-settings-modal__actions">
          <button className="chat-settings-modal__done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
