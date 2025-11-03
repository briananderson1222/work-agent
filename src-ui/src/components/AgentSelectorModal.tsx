import { useState } from 'react';
import type { AgentSummary } from '../types';

export interface AgentSelectorModalProps {
  agents: AgentSummary[];
  onSelect: (slug: string) => void;
  onCancel: () => void;
}

export function AgentSelectorModal({ agents, onSelect, onCancel }: AgentSelectorModalProps) {
  const [search, setSearch] = useState('');

  const filtered = agents.filter((agent) =>
    agent.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold mb-3">Select Agent</h2>
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
            autoFocus
          />
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {filtered.map((agent) => (
            <button
              key={agent.slug}
              onClick={() => onSelect(agent.slug)}
              className="w-full px-4 py-3 text-left hover:bg-gray-700 rounded flex flex-col gap-1"
            >
              <div className="font-medium">{agent.name}</div>
              {agent.model && (
                <div className="text-xs text-gray-400">{agent.model}</div>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-400">
              No agents found
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
