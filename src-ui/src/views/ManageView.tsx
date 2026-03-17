import type { NavigationView } from '../types';
import './page-layout.css';
import './ManageView.css';

/* ── SVG Icons ── */
const IconPlugin = () => (
  <svg
    viewBox="0 0 16 16"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 2v3M10 2v3M4 5h8a1 1 0 011 1v7a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
    <path d="M6 14v-3h4v3" />
  </svg>
);
const IconTool = () => (
  <svg
    viewBox="0 0 16 16"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9.5 2.5a3.5 3.5 0 00-3.24 4.82L2.5 11.08V13.5h2.42l3.76-3.76A3.5 3.5 0 109.5 2.5z" />
    <circle cx="10.5" cy="5.5" r="0.75" fill="currentColor" stroke="none" />
  </svg>
);

interface ManageViewProps {
  layoutCount: number;
  agentCount: number;
  onNavigate: (view: NavigationView) => void;
}

const sections = [
  {
    type: 'layouts' as const,
    idx: '01',
    icon: <span>◫</span>,
    label: 'Layouts',
    desc: 'Layouts, tabs, and layout configurations',
  },
  {
    type: 'agents' as const,
    idx: '02',
    icon: <span>⬡</span>,
    label: 'Agents',
    desc: 'AI agents with custom prompts, models, and tools',
  },
  {
    type: 'prompts' as const,
    idx: '03',
    icon: <span>⌘</span>,
    label: 'Prompts',
    desc: 'Quick prompts and saved workflows',
  },
  {
    type: 'connections-tools' as const,
    idx: '04',
    icon: <IconTool />,
    label: 'Integrations',
    desc: 'MCP server connections and registry',
  },
  {
    type: 'plugins' as const,
    idx: '05',
    icon: <IconPlugin />,
    label: 'Plugins',
    desc: 'Installed plugins — layouts, agents, and providers',
  },
] as const;

export function ManageView({
  layoutCount,
  agentCount,
  onNavigate,
}: ManageViewProps) {
  const counts: Record<string, string> = {
    layouts: `${layoutCount} configured`,
    agents: `${agentCount} available`,
  };

  return (
    <div className="manage page page--narrow">
      <div className="manage__header">
        <div className="manage__label">manage</div>
        <h1 className="manage__title">Configuration</h1>
        <p className="manage__subtitle">Layouts, agents, and prompts</p>
      </div>
      <div className="manage__grid">
        {sections.map((s) => (
          <div
            key={s.type}
            className="manage__card"
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
