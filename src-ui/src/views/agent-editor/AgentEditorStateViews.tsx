import type { AgentTemplate } from '@stallion-ai/sdk';
import type { AgentFormData } from './types';

export function AgentEditorLoadingState() {
  return <div className="editor__loading">Loading agent...</div>;
}

export function AgentEditorNotFoundState({
  selectedSlug,
  onDeselect,
}: {
  selectedSlug: string | null;
  onDeselect: () => void;
}) {
  return (
    <div className="split-pane__empty">
      <div className="split-pane__empty-icon">⬡</div>
      <p className="split-pane__empty-title">Agent not found</p>
      <p className="split-pane__empty-desc">
        The agent "{selectedSlug}" doesn't exist or was deleted.
      </p>
      <button
        type="button"
        className="editor-btn editor-btn--primary"
        onClick={onDeselect}
      >
        Back to agents
      </button>
    </div>
  );
}

export function AgentEditorTemplatePicker({
  templates,
  onPickTemplate,
  onStartBlank,
}: {
  templates: AgentTemplate[];
  onPickTemplate: (templateForm?: Partial<AgentFormData>) => void;
  onStartBlank: () => void;
}) {
  return (
    <div className="agent-editor__template-picker">
      <h3 className="agent-editor__template-title">Start with a template</h3>
      <p className="agent-editor__template-desc">
        Pick a starting point or start from scratch
      </p>
      <div className="template-grid">
        {templates.map((template) => (
          <button
            key={template.id}
            className="template-card"
            onClick={() => onPickTemplate(template.form)}
          >
            <span className="template-card__icon">{template.icon}</span>
            <span className="template-card__label">{template.label}</span>
            <span className="template-card__desc">{template.description}</span>
          </button>
        ))}
      </div>
      <button className="template-blank" onClick={onStartBlank}>
        Start Blank →
      </button>
    </div>
  );
}
