import { useAgentsQuery, useSkillsQuery } from '@stallion-ai/sdk';
import type { Skill } from '@stallion-ai/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AgentIcon } from '../components/AgentIcon';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import type { NavigationView } from '../types';
import './AgentsHub.css';

interface Prompt {
  id: string;
  name: string;
  description?: string;
  category?: string;
}

interface AgentsHubProps {
  onNavigate: (view: NavigationView) => void;
}

export function AgentsHub({ onNavigate }: AgentsHubProps) {
  const { apiBase } = useApiBase();
  const { navigate } = useNavigation();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const {
    data: agents = [],
    isError: agentsError,
    refetch: refetchAgents,
  } = useAgentsQuery();

  const {
    data: skills = [],
    isError: skillsError,
    refetch: refetchSkills,
  } = useSkillsQuery();

  const {
    data: prompts = [],
    isError: promptsError,
    refetch: refetchPrompts,
  } = useQuery<Prompt[]>({
    queryKey: ['prompts'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/prompts`);
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const localAgents = agents.filter((a: any) => a.source !== 'acp');
  const acpAgents = agents.filter((a: any) => a.source === 'acp');

  const toggle = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="agents-hub">
      <div className="agents-hub__inner">
        <div className="agents-hub__header">
          <h2 className="agents-hub__title">Agents Hub</h2>
          <p className="agents-hub__subtitle">
            Agents, skills, and prompts — the building blocks of your AI
            workflows.
          </p>
        </div>

        {/* Agents */}
        <div className="agents-hub__section">
          <button
            className="agents-hub__section-header"
            onClick={() => toggle('agents')}
          >
            <span className="agents-hub__section-chevron">
              {collapsed.agents ? '▸' : '▾'}
            </span>
            <span className="agents-hub__section-label">Agents</span>
            {localAgents.length > 0 && (
              <span className="agents-hub__section-count">
                {localAgents.length}
              </span>
            )}
            <span className="agents-hub__section-spacer" />
            <span
              className="agents-hub__add-btn"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/agents');
              }}
              role="button"
              tabIndex={-1}
            >
              Browse
            </span>
            <span
              className="agents-hub__add-btn"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate({ type: 'agent-new' });
              }}
              role="button"
              tabIndex={-1}
            >
              + New
            </span>
          </button>
          {!collapsed.agents && (
            <div className="agents-hub__cards">
              {agentsError ? (
                <div className="agents-hub__error">
                  <span>Failed to load agents.</span>
                  <button type="button" onClick={() => refetchAgents()}>
                    Retry
                  </button>
                </div>
              ) : localAgents.length > 0 ? (
                localAgents.map((agent: any) => (
                  <button
                    key={agent.slug}
                    className="agents-hub__card"
                    onClick={() =>
                      onNavigate({ type: 'agent-edit', slug: agent.slug })
                    }
                  >
                    <div className="agents-hub__card-row">
                      <AgentIcon agent={agent} size="small" />
                      <span className="agents-hub__card-name">
                        {agent.name}
                      </span>
                    </div>
                    {agent.description && (
                      <span className="agents-hub__card-desc">
                        {agent.description}
                      </span>
                    )}
                  </button>
                ))
              ) : (
                <button
                  className="agents-hub__empty-card"
                  onClick={() => onNavigate({ type: 'agent-new' })}
                >
                  Create your first agent
                </button>
              )}
            </div>
          )}
        </div>

        {/* ACP Agents */}
        {acpAgents.length > 0 && (
          <div className="agents-hub__section">
            <button
              className="agents-hub__section-header"
              onClick={() => toggle('acp')}
            >
              <span className="agents-hub__section-chevron">
                {collapsed.acp ? '▸' : '▾'}
              </span>
              <span className="agents-hub__section-label">
                Connected Agents
              </span>
              <span className="agents-hub__section-count">
                {acpAgents.length}
              </span>
              <span className="agents-hub__section-spacer" />
              <span
                className="agents-hub__add-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/connections');
                }}
                role="button"
                tabIndex={-1}
              >
                Manage
              </span>
            </button>
            {!collapsed.acp && (
              <div className="agents-hub__cards">
                {acpAgents.map((agent: any) => (
                  <button
                    key={agent.slug}
                    className="agents-hub__card agents-hub__card--acp"
                    onClick={() =>
                      onNavigate({ type: 'agent-edit', slug: agent.slug })
                    }
                  >
                    <div className="agents-hub__card-row">
                      <AgentIcon agent={agent} size="small" />
                      <span className="agents-hub__card-name">
                        {agent.name}
                      </span>
                    </div>
                    {agent.description && (
                      <span className="agents-hub__card-desc">
                        {agent.description}
                      </span>
                    )}
                    <span className="agents-hub__card-badge">
                      {agent.connectionName || 'ACP'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Skills */}
        <div className="agents-hub__section">
          <button
            className="agents-hub__section-header"
            onClick={() => toggle('skills')}
          >
            <span className="agents-hub__section-chevron">
              {collapsed.skills ? '▸' : '▾'}
            </span>
            <span className="agents-hub__section-label">Skills</span>
            {skills.length > 0 && (
              <span className="agents-hub__section-count">{skills.length}</span>
            )}
            <span className="agents-hub__section-spacer" />
            <span
              className="agents-hub__add-btn"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate({ type: 'skills' });
              }}
              role="button"
              tabIndex={-1}
            >
              Browse
            </span>
          </button>
          {!collapsed.skills && (
            <div className="agents-hub__cards">
              {skillsError ? (
                <div className="agents-hub__error">
                  <span>Failed to load skills.</span>
                  <button type="button" onClick={() => refetchSkills()}>
                    Retry
                  </button>
                </div>
              ) : skills.length > 0 ? (
                skills.map((skill: Skill) => (
                  <button
                    key={skill.name}
                    className="agents-hub__card"
                    onClick={() => navigate(`/skills/${skill.name}`)}
                  >
                    <div className="agents-hub__card-row">
                      <span className="agents-hub__card-icon">⚡</span>
                      <span className="agents-hub__card-name">
                        {skill.name}
                      </span>
                    </div>
                    <span className="agents-hub__card-desc">
                      {skill.description ?? skill.source ?? ''}
                    </span>
                  </button>
                ))
              ) : (
                <button
                  className="agents-hub__empty-card"
                  onClick={() => onNavigate({ type: 'skills' })}
                >
                  Install skills from plugins
                </button>
              )}
            </div>
          )}
        </div>

        {/* Prompts */}
        <div className="agents-hub__section">
          <button
            className="agents-hub__section-header"
            onClick={() => toggle('prompts')}
          >
            <span className="agents-hub__section-chevron">
              {collapsed.prompts ? '▸' : '▾'}
            </span>
            <span className="agents-hub__section-label">Prompts</span>
            {prompts.length > 0 && (
              <span className="agents-hub__section-count">
                {prompts.length}
              </span>
            )}
            <span className="agents-hub__section-spacer" />
            <span
              className="agents-hub__add-btn"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/prompts');
              }}
              role="button"
              tabIndex={-1}
            >
              Browse
            </span>
            <span
              className="agents-hub__add-btn"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/prompts/new');
              }}
              role="button"
              tabIndex={-1}
            >
              + New
            </span>
          </button>
          {!collapsed.prompts && (
            <div className="agents-hub__cards">
              {promptsError ? (
                <div className="agents-hub__error">
                  <span>Failed to load prompts.</span>
                  <button type="button" onClick={() => refetchPrompts()}>
                    Retry
                  </button>
                </div>
              ) : prompts.length > 0 ? (
                prompts.map((prompt) => (
                  <button
                    key={prompt.id}
                    className="agents-hub__card"
                    onClick={() => navigate(`/prompts/${prompt.id}`)}
                  >
                    <span className="agents-hub__card-name">{prompt.name}</span>
                    <span className="agents-hub__card-desc">
                      {prompt.category ?? prompt.description ?? ''}
                    </span>
                  </button>
                ))
              ) : (
                <button
                  className="agents-hub__empty-card"
                  onClick={() => navigate('/prompts/new')}
                >
                  Create your first prompt
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
