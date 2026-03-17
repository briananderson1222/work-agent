import { useAgentsQuery } from '@stallion-ai/sdk';
import { useQuery } from '@tanstack/react-query';
import { AgentIcon } from '../components/AgentIcon';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import type { NavigationView } from '../types';
import './AgentsHub.css';

interface Skill {
  name: string;
  description?: string;
  source?: string;
}

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

  const { data: agents = [] } = useAgentsQuery();

  const { data: skills = [] } = useQuery<Skill[]>({
    queryKey: ['skills'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/skills`);
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const { data: prompts = [] } = useQuery<Prompt[]>({
    queryKey: ['prompts'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/prompts`);
      const json = await res.json();
      return json.data ?? [];
    },
  });

  return (
    <div className="agents-hub">
      <div className="agents-hub__inner">
        <div className="agents-hub__header">
          <h2 className="agents-hub__title">Agents Hub</h2>
          <p className="agents-hub__subtitle">
            Agents, skills, and prompts — the building blocks of your AI workflows.
          </p>
        </div>

        {/* Agents */}
        <div className="agents-hub__section">
          <div className="agents-hub__section-header">
            <span className="agents-hub__section-label">Agents</span>
            <button
              className="agents-hub__add-btn"
              onClick={() => onNavigate({ type: 'agent-new' })}
            >
              + New
            </button>
          </div>
          <div className="agents-hub__cards">
            {agents.length > 0 ? (
              agents.map((agent: any) => (
                <button
                  key={agent.slug}
                  className="agents-hub__card"
                  onClick={() => onNavigate({ type: 'agent-edit', slug: agent.slug })}
                >
                  <AgentIcon agent={agent} size="small" />
                  <span className="agents-hub__card-name">{agent.name}</span>
                  {agent.description && (
                    <span className="agents-hub__card-desc">{agent.description}</span>
                  )}
                  {agent.source === 'acp' && (
                    <span className="agents-hub__card-badge">ACP</span>
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
        </div>

        {/* Skills */}
        <div className="agents-hub__section">
          <div className="agents-hub__section-header">
            <span className="agents-hub__section-label">Skills</span>
            <button
              className="agents-hub__add-btn"
              onClick={() => onNavigate({ type: 'skills' })}
            >
              Browse
            </button>
          </div>
          <div className="agents-hub__cards">
            {skills.length > 0 ? (
              skills.map((skill) => (
                <button
                  key={skill.name}
                  className="agents-hub__card"
                  onClick={() => onNavigate({ type: 'skills' })}
                >
                  <span className="agents-hub__card-icon">⚡</span>
                  <span className="agents-hub__card-name">{skill.name}</span>
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
        </div>

        {/* Prompts */}
        <div className="agents-hub__section">
          <div className="agents-hub__section-header">
            <span className="agents-hub__section-label">Prompts</span>
            <button
              className="agents-hub__add-btn"
              onClick={() => navigate('/prompts/new')}
            >
              + New
            </button>
          </div>
          <div className="agents-hub__cards">
            {prompts.length > 0 ? (
              prompts.map((prompt) => (
                <button
                  key={prompt.id}
                  className="agents-hub__card"
                  onClick={() => navigate(`/prompts/${prompt.id}`)}
                >
                  <span className="agents-hub__card-icon">📝</span>
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
        </div>
      </div>
    </div>
  );
}
