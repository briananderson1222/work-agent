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
  autoHideEnabled: boolean;
  setAutoHideEnabled: (v: boolean) => void;
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
  autoHideEnabled,
  setAutoHideEnabled,
}: ChatSettingsPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="chat-settings-overlay" onClick={onClose}>
      <div className="chat-settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="chat-settings-modal__title">Chat Settings</h3>

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
              className={`chat-settings-modal__btn${chatFontSize === defaultFontSize ? ' chat-settings-modal__btn--muted' : ''}`}
              onClick={() => setChatFontSize(() => defaultFontSize)}
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

        <div className="chat-settings-modal__section">
          <label className="chat-settings-modal__checkbox">
            <Toggle
              checked={autoHideEnabled}
              onChange={setAutoHideEnabled}
              size="sm"
            />
            <span>Auto-hide dock</span>
          </label>
          <p className="chat-settings-modal__hint">
            Collapse dock after 5 seconds of inactivity
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
