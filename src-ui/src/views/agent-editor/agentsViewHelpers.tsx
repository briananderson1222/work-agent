import type { ReactNode } from 'react';
import { AgentIcon } from '../../components/AgentIcon';
import type { AgentData } from '../../contexts/AgentsContext';
import { formatExecutionSummary } from '../../utils/execution';
import type { AgentFormData } from './types';

type ACPConnectionItem = {
  id: string;
  name?: string;
  icon?: string;
  modes?: unknown[];
};

export function buildAgentsViewItems(
  agents: AgentData[],
  acpConnections: ACPConnectionItem[],
) {
  const standalone = agents.filter(
    (a) => !a.slug.includes(':') && a.source !== 'acp',
  );
  const layoutAgents = agents.filter(
    (a) => a.slug.includes(':') && a.source !== 'acp',
  );

  const agentItems = [...standalone, ...layoutAgents].map((agent) => ({
    id: agent.slug,
    name: agent.name,
    subtitle: formatExecutionSummary(agent) || agent.slug,
    icon: <AgentIcon agent={agent as any} size="small" />,
  }));

  const connItems = acpConnections.map((connection) => ({
    id: `__acp:${connection.id}`,
    name: connection.name || connection.id,
    subtitle: `${(connection.modes || []).length} agents · ACP`,
    icon: connection.icon ? (
      <img src={connection.icon} alt="" className="agents-list__acp-icon" />
    ) : (
      <span className="agents-list__acp-emoji">🔌</span>
    ),
  }));

  return [...agentItems, ...connItems];
}

export function buildAgentsViewEmptyContent(options: {
  agentsCount: number;
  templates: Array<{
    id: string;
    icon?: string;
    label?: string;
    description?: string;
    source?: string;
    form?: Partial<AgentFormData>;
  }>;
  onCreateFromTemplate: (templateForm?: Partial<AgentFormData>) => void;
  onCreateBlank: () => void;
}): ReactNode {
  if (options.agentsCount === 0) {
    return (
      <div className="agents-empty-wrapper">
        <div className="agents-onboard">
          <h3 className="agents-onboard__title">Get started</h3>
          <p className="agents-onboard__desc">
            Create your first agent from a template
          </p>
          <div className="template-grid">
            {options.templates.map((template) => (
              <button
                key={template.id}
                className="template-card"
                onClick={() => options.onCreateFromTemplate(template.form)}
              >
                <span className="template-card__icon">{template.icon}</span>
                <span className="template-card__label">{template.label}</span>
                <span className="template-card__desc">
                  {template.description}
                </span>
                {template.source !== 'built-in' && (
                  <span className="template-card__source">
                    {template.source}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="split-pane__empty">
      <div className="split-pane__empty-icon">⬡</div>
      <p className="split-pane__empty-title">No agent selected</p>
      <p className="split-pane__empty-desc">
        Select an agent to edit, or create a new one
      </p>
      <button
        type="button"
        className="editor-btn editor-btn--primary"
        onClick={options.onCreateBlank}
      >
        Create new agent
      </button>
    </div>
  );
}
