import type { Skill } from '@stallion-ai/contracts/catalog';
import {
  useInstallSkillMutation,
  useRegistrySkillsQuery,
  useSkillContentQuery,
  useSkillsQuery,
  useUninstallSkillMutation,
  useUpdateSkillMutation,
} from '@stallion-ai/sdk';
import { skillToGuidanceAsset } from '@stallion-ai/shared';
import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useToast } from '../contexts/ToastContext';
import { useUrlSelection } from '../hooks/useUrlSelection';
import './editor-layout.css';
import './page-layout.css';
import './skills-view.css';

export function SkillsView() {
  const { selectedId, select, deselect } = useUrlSelection('/skills');
  const [search, setSearch] = useState('');
  const { showToast } = useToast();

  const { data: localRaw = [] } = useSkillsQuery();
  const { data: registryRaw = [], isLoading } = useRegistrySkillsQuery();

  const localSkills: Skill[] = localRaw.map((s: any) => ({
    ...s,
    name: s.name || s.id,
    installedVersion: s.version,
    source: 'local',
    installed: true,
  }));

  const registrySkills: Skill[] = registryRaw.map((s: any) => ({
    ...s,
    name: s.id || s.displayName,
    source: 'registry',
    installed: false,
  }));

  const skills = useMemo(() => {
    const registryMap = new Map(registrySkills.map((s) => [s.name, s]));
    const localNames = new Set(localSkills.map((s) => s.name));
    const merged = localSkills.map((s) => {
      const reg = registryMap.get(s.name);
      const updateAvailable =
        !!reg?.version &&
        !!s.installedVersion &&
        reg.version !== s.installedVersion;
      return { ...s, updateAvailable: updateAvailable ?? false };
    });
    for (const s of registrySkills) {
      if (!localNames.has(s.name))
        merged.push({ ...s, updateAvailable: s.updateAvailable ?? false });
    }
    return merged;
  }, [localSkills, registrySkills]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return skills.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [skills, search]);

  const guidanceAssets = useMemo(
    () => filtered.map(skillToGuidanceAsset),
    [filtered],
  );

  const items = guidanceAssets.map((asset) => ({
    id: asset.name,
    name: asset.name,
    subtitle: asset.packaging?.installed
      ? '✓ Installed'
      : asset.packaging?.source || asset.source,
  }));

  const selected = skills.find((s) => s.name === selectedId);

  const installMutation = useInstallSkillMutation();
  const uninstallMutation = useUninstallSkillMutation();
  const updateMutation = useUpdateSkillMutation();

  const { data: skillBody } = useSkillContentQuery(
    selected && !selected.installed ? selected.name : undefined,
  );

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
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {selected.installed ? (
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  ) : (
                    <>
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </>
                  )}
                </svg>
              </div>
              <div className="skill-detail__hero-text">
                <h2 className="skill-detail__name">{selected.name}</h2>
                <div className="skill-detail__meta">
                  {selected.installed ? (
                    <span className="skill-detail__badge skill-detail__badge--installed">
                      Installed
                    </span>
                  ) : (
                    <span className="skill-detail__badge skill-detail__badge--registry">
                      Registry
                    </span>
                  )}
                  {selected.version && (
                    <span className="skill-detail__badge skill-detail__badge--version">
                      v{selected.version}
                    </span>
                  )}
                </div>
              </div>
              <div className="skill-detail__actions">
                {selected.installed ? (
                  <>
                    {selected.updateAvailable && (
                      <button
                        className="skill-detail__btn skill-detail__btn--install"
                        disabled={updateMutation.isPending}
                        onClick={() =>
                          updateMutation.mutate(selected.name, {
                            onError: () => showToast('Failed to update skill'),
                          })
                        }
                      >
                        {updateMutation.isPending ? 'Updating…' : 'Update'}
                      </button>
                    )}
                    <button
                      className="skill-detail__btn skill-detail__btn--uninstall"
                      disabled={uninstallMutation.isPending}
                      onClick={() =>
                        uninstallMutation.mutate(selected.name, {
                          onError: () => showToast('Failed to remove skill'),
                        })
                      }
                    >
                      {uninstallMutation.isPending ? 'Removing…' : 'Uninstall'}
                    </button>
                  </>
                ) : (
                  <button
                    className="skill-detail__btn skill-detail__btn--install"
                    disabled={installMutation.isPending}
                    onClick={() =>
                      installMutation.mutate(selected.name, {
                        onError: () => showToast('Failed to install skill'),
                      })
                    }
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

            {selected.tags && selected.tags.length > 0 && (
              <div className="skill-detail__tags">
                {selected.tags.map((tag) => (
                  <span key={tag} className="skill-detail__tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {selected.description && (
              <div className="skill-detail__section">
                <p className="skill-detail__description">
                  {selected.description}
                </p>
              </div>
            )}

            {skillBody && (
              <div className="skill-detail__section skill-detail__body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {skillBody}
                </ReactMarkdown>
              </div>
            )}

            {selected.path && (
              <div className="skill-detail__section">
                <div className="skill-detail__label">Location</div>
                <code className="skill-detail__path">{selected.path}</code>
              </div>
            )}

            {!selected.installed && !skillBody && (
              <div className="skill-detail__hint">
                Install this skill, then enable it on any agent from the agent
                editor.
              </div>
            )}
          </div>
        )}
      </SplitPaneLayout>
    </div>
  );
}
