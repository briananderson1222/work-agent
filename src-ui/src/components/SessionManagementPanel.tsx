import type { ReactNode } from 'react';
import { useNavigation } from '../contexts/NavigationContext';

interface PanelBounds {
  top: number;
  bottom: number;
  left: number;
}

interface SessionManagementPanelProps {
  bounds: PanelBounds;
  conversationCount: number;
  onClose: () => void;
  onClearAll: () => void;
  children: ReactNode;
}

export function SessionManagementPanel({
  bounds,
  conversationCount,
  onClose,
  onClearAll,
  children,
}: SessionManagementPanelProps) {
  const { dockMode } = useNavigation();
  const isRight = dockMode === 'right';

  return (
    <div
      className="session-panel"
      style={{
        left: isRight ? undefined : bounds.left,
        top: bounds.top,
        bottom: `${window.innerHeight - bounds.bottom}px`,
      }}
    >
      <div className="session-panel__header">
        <div className="session-panel__title">
          Conversation History ({conversationCount})
        </div>
        <div className="session-panel__actions">
          {conversationCount > 0 && (
            <button className="session-panel__clear-btn" onClick={onClearAll}>
              Clear All
            </button>
          )}
          <button className="session-panel__close-btn" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <div className="session-panel__content">{children}</div>
    </div>
  );
}
