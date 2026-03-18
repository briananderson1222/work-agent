import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useUrlSelection } from '../hooks/useUrlSelection';
import './editor-layout.css';
import './page-layout.css';
import './skills-view.css';

interface Skill {
  name: string;
  description?: string;
  source?: string;
  path?: string;
  installed?: boolean;
}

export function SkillsView() {
  const { apiBase } = useApiBase();
  const { selectedId, select, deselect } = useUrlSelection('/skills');
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: localSkills = [] } = useQuery<Skill[]>({
    queryKey: ['skills', 'local'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/system/skills`);
      const json = await res.json();
      return (json.data ?? []).map((s: any) => ({ ...s, source: 'local', installed: true }));
    },
  });

  const { data: registrySkills = [], isLoading } = useQuery<Skill[]>({
    queryKey: ['skills', 'registry'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/registry/skills`);
      const json = await res.json();
      return (json.data ?? []).map((s: any) => ({
        name: s.id || s.displayName,
        description: s.description,
        source: 'registry',
        installed: false,
      }));
    },
  });

  const skills = useMemo(() => {
    const localNames = new Set(localSkills.map((s) => s.name));
    const merged = [...localSkills];
    for (const s of registrySkills) {
      if (!localNames.has(s.name)) merged.push(s);
    }
    return merged;
  }, [localSkills, registrySkills]);

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
    subtitle: s.installed ? '✓ Installed' : s.source,
  }));

  const selected = skills.find((s) => s.name === selectedId);

  const installMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiBase}/api/registry/skills/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skills'] }),
  });

  const uninstallMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiBase}/api/registry/skills/${id}`, { method: 'DELETE' });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skills'] }),
  });

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
          <div className="skill-detail">
            <div className="skill-detail__hero">
              <div className="skill-detail__icon">
                {selected.installed ? '⚡' : '📦'}
              </div>
              <div className="skill-detail__hero-text">
                <h2 className="skill-detail__name">{selected.name}</h2>
                <div className="skill-detail__meta">
                  {selected.installed ? (
                    <span className="skill-detail__badge skill-detail__badge--installed">Installed</span>
                  ) : (
                    <span className="skill-detail__badge skill-detail__badge--registry">Registry</span>
                  )}
                  {selected.source === 'local' && selected.path && (
                    <span className="skill-detail__badge skill-detail__badge--local">Local</span>
                  )}
                </div>
              </div>
              <div className="skill-detail__actions">
                {selected.installed ? (
                  <button
                    className="skill-detail__btn skill-detail__btn--uninstall"
                    disabled={uninstallMutation.isPending}
                    onClick={() => uninstallMutation.mutate(selected.name)}
                  >
                    {uninstallMutation.isPending ? 'Removing…' : 'Uninstall'}
                  </button>
                ) : (
                  <button
                    className="skill-detail__btn skill-detail__btn--install"
                    disabled={installMutation.isPending}
                    onClick={() => installMutation.mutate(selected.name)}
                  >
                    {installMutation.isPending ? (
                      'Installing…'
                    ) : (
                      <>
                        <span className="skill-detail__btn-icon">↓</span>
                        Install
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {selected.description && (
              <div className="skill-detail__section">
                <p className="skill-detail__description">{selected.description}</p>
              </div>
            )}

            {selected.path && (
              <div className="skill-detail__section">
                <div className="skill-detail__label">Location</div>
                <code className="skill-detail__path">{selected.path}</code>
              </div>
            )}

            {!selected.installed && (
              <div className="skill-detail__hint">
                Install this skill, then enable it on any agent from the agent editor.
              </div>
            )}
          </div>
        )}
      </SplitPaneLayout>
    </div>
  );
}
