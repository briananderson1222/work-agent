import { AutoSelectModal, AutoSelectItem } from './AutoSelectModal';
import type { AgentSummary } from '../types';

export interface AgentSelectorModalProps {
  agents: AgentSummary[];
  onSelect: (slug: string) => void;
  onCancel: () => void;
}

export function AgentSelectorModal({ agents, onSelect, onCancel }: AgentSelectorModalProps) {
  const items: AutoSelectItem<AgentSummary>[] = agents.map(agent => ({
    id: agent.slug,
    title: agent.name,
    subtitle: agent.model,
    metadata: agent,
  }));

  return (
    <AutoSelectModal
      isOpen={true}
      title="Select Agent"
      placeholder="Search agents..."
      items={items}
      emptyMessage="No agents found"
      onSelect={(item) => onSelect(item.id)}
      onClose={onCancel}
      showCancel={true}
    />
  );
}
