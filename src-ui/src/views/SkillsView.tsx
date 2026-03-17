import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useUrlSelection } from '../hooks/useUrlSelection';
import './editor-layout.css';
import './page-layout.css';

interface Skill {
  name: string;
  description?: string;
  source?: string;
  path?: string;
}

export function SkillsView() {
  const { apiBase } = useApiBase();
  const { selectedId, select, deselect } = useUrlSelection('/skills');
  const [search, setSearch] = useState('');

  const { data: skills = [], isLoading } = useQuery<Skill[]>({
    queryKey: ['skills'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/skills`);
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return skills.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q),
    );
  }, [skills, search]);

  const items = filtered.map((s) => ({
    id: s.name,
    name: s.name,
    subtitle: s.source,
  }));

  const selected = skills.find((s) => s.name === selectedId);

  return (
    <div className="page page--full">
      <SplitPaneLayout
        label="skills"
        title="Skills"
        subtitle="Capabilities available to agents"
        items={items}
        loading={isLoading}
        selectedId={selectedId}
        onSelect={select}
        onDeselect={deselect}
        onSearch={setSearch}
        searchPlaceholder="Search skills..."
        emptyIcon="⚡"
        emptyTitle="No skill selected"
        emptyDescription="Select a skill to view details"
      >
        {selected && (
          <div className="detail-panel">
            <div className="agent-inline-editor__header">
              <h2 className="detail-panel__title">{selected.name}</h2>
            </div>

            {selected.description && (
              <div className="editor-field">
                <label className="editor-label">Description</label>
                <span>{selected.description}</span>
              </div>
            )}

            <div className="editor-field">
              <label className="editor-label">Source</label>
              <span>{selected.source ?? '—'}</span>
            </div>

            {selected.path && (
              <div className="editor-field">
                <label className="editor-label">Path</label>
                <code className="editor-hint">{selected.path}</code>
              </div>
            )}

            <div className="editor-field">
              <label className="editor-label">Used by</label>
              <span>—</span>
            </div>
          </div>
        )}
      </SplitPaneLayout>
    </div>
  );
}
