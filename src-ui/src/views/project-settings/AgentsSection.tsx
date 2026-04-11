import { useAgentsQuery } from '@stallion-ai/sdk';
import type { Dispatch, SetStateAction } from 'react';
import { AgentIcon } from '../../components/AgentIcon';
import { Checkbox } from '../../components/Checkbox';
import type { ProjectForm } from './types';

export function AgentsSection({
  form,
  setForm,
}: {
  form: ProjectForm;
  setForm: Dispatch<SetStateAction<ProjectForm | null>>;
}) {
  const { data: allAgents = [] } = useAgentsQuery() as {
    data?: Array<{ slug: string; name: string; icon?: string }>;
  };
  const selected = new Set(form.agents ?? []);
  const allSelected = selected.size === 0;

  function toggle(slug: string) {
    setForm((currentForm) => {
      if (!currentForm) return currentForm;
      const current = new Set(currentForm.agents ?? []);
      if (current.has(slug)) current.delete(slug);
      else current.add(slug);
      return { ...currentForm, agents: [...current] };
    });
  }

  return (
    <section className="project-settings__section">
      <div className="project-settings__section-title project-settings__section-title--sm">
        Agents
      </div>
      <span className="editor-hint">
        {allSelected
          ? 'All agents are available (no filter set).'
          : `${selected.size} agent${selected.size !== 1 ? 's' : ''} selected.`}
      </span>
      <div className="editor__tools-server">
        <div className="editor__tools-list">
          {allAgents.map((agent) => (
            <div
              key={agent.slug}
              className={`editor__tool-item${allSelected || selected.has(agent.slug) ? ' editor__tool-item--active' : ''}`}
            >
              <Checkbox
                checked={allSelected || selected.has(agent.slug)}
                onChange={() => toggle(agent.slug)}
              />
              <div className="editor__tool-info">
                <div className="editor__tool-name">
                  <AgentIcon
                    agent={agent}
                    size="small"
                    className="editor-icon-preview"
                  />{' '}
                  {agent.name}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
