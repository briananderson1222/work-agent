import type { LayoutPrompt } from '@stallion-ai/contracts/layout';

export interface QuickActionsBarProps {
  globalPrompts?: LayoutPrompt[];
  localPrompts?: LayoutPrompt[];
  onPromptSelect: (prompt: LayoutPrompt) => void;
}

export function QuickActionsBar({
  globalPrompts,
  localPrompts,
  onPromptSelect,
}: QuickActionsBarProps) {
  const hasGlobal = (globalPrompts?.length ?? 0) > 0;
  const hasLocal = (localPrompts?.length ?? 0) > 0;

  if (!hasGlobal && !hasLocal) {
    return (
      <div className="quick-actions">
        <span className="quick-actions__helper">
          Define prompts in layout.json to surface them here.
        </span>
      </div>
    );
  }

  return (
    <div className="quick-actions">
      {hasGlobal && (
        <div className="quick-actions__group">
          <span className="quick-actions__label">Global Prompts</span>
          <div className="quick-actions__buttons">
            {globalPrompts!.map((prompt) => (
              <button
                type="button"
                key={prompt.id}
                className="quick-actions__button"
                onClick={() => onPromptSelect(prompt)}
              >
                {prompt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasLocal && (
        <div className="quick-actions__group">
          <span className="quick-actions__label">Tab Prompts</span>
          <div className="quick-actions__buttons">
            {localPrompts!.map((prompt) => (
              <button
                type="button"
                key={prompt.id}
                className="quick-actions__button quick-actions__button--secondary"
                onClick={() => onPromptSelect(prompt)}
              >
                {prompt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
