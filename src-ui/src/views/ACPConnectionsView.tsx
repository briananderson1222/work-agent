import { ACPConnectionsSection } from '../components/ACPConnectionsSection';
import type { AgentSummary, NavigationView } from '../types';
import './ConnectionsHub.css';

interface ACPConnectionsViewProps {
  agents: AgentSummary[];
  onNavigate: (view: NavigationView) => void;
}

export function ACPConnectionsView({
  agents,
  onNavigate,
}: ACPConnectionsViewProps) {
  return (
    <div className="connections-hub">
      <div className="connections-hub__inner">
        <div className="connections-hub__breadcrumb">
          <button
            className="connections-hub__breadcrumb-link"
            onClick={() => onNavigate({ type: 'connections' })}
          >
            Connections
          </button>
          <span>/</span>
          <span>ACP Connections</span>
        </div>
        <div className="connections-hub__header">
          <h2 className="connections-hub__title">ACP Connections</h2>
          <p className="connections-hub__desc">
            Command-backed external agent runtimes and their discovered
            capabilities.
          </p>
        </div>
        <ACPConnectionsSection acpAgents={agents} />
      </div>
    </div>
  );
}
