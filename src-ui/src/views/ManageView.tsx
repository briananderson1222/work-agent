import type { NavigationView } from '../types';
import './ManageView.css';

interface ManageViewProps {
  workspaceCount: number;
  agentCount: number;
  onNavigate: (view: NavigationView) => void;
}

const sections = [
  {
    type: 'workspaces' as const,
    idx: '01',
    icon: '◫',
    label: 'Workspaces',
    desc: 'Layouts, tabs, and workspace configurations',
  },
  {
    type: 'agents' as const,
    idx: '02',
    icon: '⬡',
    label: 'Agents',
    desc: 'AI agents with custom prompts, models, and tools',
  },
  {
    type: 'prompts' as const,
    idx: '03',
    icon: '⌘',
    label: 'Prompts',
    desc: 'Quick prompts and saved workflows',
  },
  {
    type: 'plugins' as const,
    idx: '04',
    icon: '⚡',
    label: 'Plugins',
    desc: 'Installed plugins — may include workspaces, agents, and prompts',
    wide: true,
  },
] as const;

export function ManageView({
  workspaceCount,
  agentCount,
  onNavigate,
}: ManageViewProps) {
  const counts: Record<string, string> = {
    workspaces: `${workspaceCount} configured`,
    agents: `${agentCount} available`,
  };

  return (
    <div className="manage">
      <div className="manage__header">
        <div className="manage__label">sys / manage</div>
        <h1 className="manage__title">Configuration</h1>
        <p className="manage__subtitle">Workspaces, agents, and prompts</p>
      </div>
      <div className="manage__grid">
        {sections.map((s) => (
          <div
            key={s.type}
            className={`manage__card ${'wide' in s && s.wide ? 'manage__card--wide' : ''}`}
            onClick={() => onNavigate({ type: s.type })}
          >
            <div className="manage__card-index">{s.idx}</div>
            <div className="manage__card-icon">{s.icon}</div>
            <div className="manage__card-title">{s.label}</div>
            <div className="manage__card-desc">{s.desc}</div>
            {counts[s.type] && (
              <div className="manage__card-count">{counts[s.type]}</div>
            )}
            <span className="manage__card-arrow">→</span>
          </div>
        ))}
      </div>
    </div>
  );
}
