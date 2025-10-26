import type { AgentQuickPrompt, WorkflowMetadata } from '../types';

export interface QuickActionsBarProps {
  prompts?: AgentQuickPrompt[];
  workflowShortcuts?: string[];
  onPromptSelect: (prompt: AgentQuickPrompt) => void;
  onWorkflowSelect: (workflowId: string) => void;
  workflowMetadata?: WorkflowMetadata[];
}

const formatWorkflowLabel = (identifier: string) => {
  if (!identifier.includes('.')) {
    return identifier.replace(/[-_]/g, ' ');
  }

  const base = identifier.split('.')[0];
  return base.replace(/[-_]/g, ' ');
};

export function QuickActionsBar({
  prompts,
  workflowShortcuts,
  onPromptSelect,
  onWorkflowSelect,
  workflowMetadata,
}: QuickActionsBarProps) {
  const hasPrompts = (prompts?.length ?? 0) > 0;
  const hasWorkflowShortcuts = (workflowShortcuts?.length ?? 0) > 0;
  const workflowLabelMap = new Map((workflowMetadata ?? []).map((item) => [item.id, item.label]));

  return (
    <div className="quick-actions">
      <div className="quick-actions__group">
        <span className="quick-actions__label">Quick Prompts</span>
        {hasPrompts ? (
          <div className="quick-actions__buttons">
            {prompts!.map((prompt) => (
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
        ) : (
          <span className="quick-actions__helper">Define quick prompts in agent.json to surface them here.</span>
        )}
      </div>

      <div className="quick-actions__group">
        <span className="quick-actions__label">Workflows</span>
        {hasWorkflowShortcuts ? (
          <div className="quick-actions__buttons">
            {workflowShortcuts!.map((workflow) => (
              <button
                type="button"
                key={workflow}
                className="quick-actions__button quick-actions__button--secondary"
                onClick={() => onWorkflowSelect(workflow)}
              >
                {workflowLabelMap.get(workflow) ?? formatWorkflowLabel(workflow)}
              </button>
            ))}
          </div>
        ) : (
          <span className="quick-actions__helper">
            Add `ui.workflowShortcuts` in agent.json to feature specific workflows here.
          </span>
        )}
      </div>
    </div>
  );
}
