import type { Skill } from '@stallion-ai/contracts/catalog';
import {
  useCreateLocalSkillMutation,
  useSkillQuery,
  useSkillsQuery,
  useUninstallSkillMutation,
  useUpdateLocalSkillMutation,
} from '@stallion-ai/sdk';
import { skillToGuidanceAsset } from '@stallion-ai/shared';
import { useEffect, useMemo, useState } from 'react';
import { DetailHeader } from '../components/DetailHeader';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useNavigation } from '../contexts/NavigationContext';
import { useToast } from '../contexts/ToastContext';
import { useUrlSelection } from '../hooks/useUrlSelection';
import './editor-layout.css';
import './page-layout.css';
import './skills-view.css';

interface SkillForm {
  name: string;
  description: string;
  body: string;
  tags: string;
  category: string;
  agent: string;
  global: boolean;
}

const EMPTY_SKILL_FORM: SkillForm = {
  name: '',
  description: '',
  body: '',
  tags: '',
  category: '',
  agent: '',
  global: false,
};

export function SkillsView() {
  const {
    selectedId: rawSelectedId,
    select,
    deselect,
  } = useUrlSelection('/skills');
  const selectedId = rawSelectedId === 'new' ? null : rawSelectedId;
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(rawSelectedId === 'new');
  const splitPaneSelectedId = isCreating ? '__new__' : selectedId;
  const [form, setForm] = useState<SkillForm>(EMPTY_SKILL_FORM);
  const { navigate } = useNavigation();
  const { showToast } = useToast();

  const { data: localRaw = [] } = useSkillsQuery();
  const isLoading = false;

  const localSkills: Skill[] = localRaw.map((s: any) => ({
    ...s,
    name: s.name || s.id,
    installedVersion: s.version,
    source: s.source || 'local',
    installed: true,
    updateAvailable: false,
  }));

  const skills = useMemo(() => localSkills, [localSkills]);

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
      : asset.packaging?.source || asset.source || 'registry',
  }));

  const selected = skills.find((s) => s.name === selectedId);
  const editableLocalSkillName =
    isCreating || (selected?.installed && selected.source === 'local')
      ? (selected?.name ?? undefined)
      : undefined;
  const { data: editableSkill } = useSkillQuery(editableLocalSkillName, {
    enabled: !!editableLocalSkillName && !isCreating,
  });

  const createLocalMutation = useCreateLocalSkillMutation();
  const uninstallMutation = useUninstallSkillMutation();
  const updateLocalMutation = useUpdateLocalSkillMutation();

  useEffect(() => {
    setIsCreating(rawSelectedId === 'new');
  }, [rawSelectedId]);

  useEffect(() => {
    if (isCreating) {
      setForm(EMPTY_SKILL_FORM);
      return;
    }
    if (editableSkill) {
      setForm({
        name: editableSkill.name ?? '',
        description: editableSkill.description ?? '',
        body: editableSkill.body ?? '',
        tags: Array.isArray(editableSkill.tags)
          ? editableSkill.tags.join(', ')
          : '',
        category: editableSkill.category ?? '',
        agent: editableSkill.agent ?? '',
        global: !!editableSkill.global,
      });
    }
  }, [editableSkill, isCreating]);

  const tags = form.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  async function handleSaveLocalSkill() {
    if (!form.name.trim() || !form.body.trim()) {
      showToast('Name and body are required');
      return;
    }
    const payload = {
      name: form.name.trim(),
      body: form.body,
      description: form.description || undefined,
      category: form.category || undefined,
      tags: tags.length > 0 ? tags : undefined,
      agent: form.agent || undefined,
      global: form.global || undefined,
    };
    try {
      if (isCreating) {
        await createLocalMutation.mutateAsync(payload);
        setIsCreating(false);
        select(payload.name);
      } else {
        await updateLocalMutation.mutateAsync(payload);
      }
      showToast('Skill saved');
    } catch {
      showToast('Failed to save skill');
    }
  }

  const editableLocal =
    isCreating || (selected?.installed && selected.source === 'local');

  return (
    <div className="page page--full">
      <SplitPaneLayout
        label="skills"
        title="Skills"
        subtitle="Capabilities available to agents"
        items={items}
        loading={isLoading}
        selectedId={splitPaneSelectedId}
        onSelect={select}
        onDeselect={deselect}
        onSearch={setSearch}
        searchPlaceholder="Search skills..."
        onAdd={() => {
          select('new');
          setIsCreating(true);
        }}
        addLabel="+ New Skill"
        sidebarActions={
          <button
            className="split-pane__add-btn split-pane__add-btn--secondary"
            onClick={() => navigate('/playbooks')}
          >
            Open Playbooks
          </button>
        }
        emptyIcon="⚡"
        emptyTitle="No skill selected"
        emptyDescription="Select a skill to view details"
      >
        {editableLocal && (
          <div className="skill-detail">
            <DetailHeader
              title={isCreating ? 'New Skill' : form.name || 'Edit Skill'}
            >
              {!isCreating && selected && (
                <button
                  className="editor-btn editor-btn--danger"
                  onClick={() =>
                    uninstallMutation.mutate(selected.name, {
                      onSuccess: () => {
                        showToast('Skill removed');
                        deselect();
                      },
                      onError: () => showToast('Failed to remove skill'),
                    })
                  }
                >
                  Remove
                </button>
              )}
              <button
                className="editor-btn editor-btn--primary"
                onClick={handleSaveLocalSkill}
                disabled={
                  createLocalMutation.isPending || updateLocalMutation.isPending
                }
              >
                {createLocalMutation.isPending || updateLocalMutation.isPending
                  ? 'Saving…'
                  : isCreating
                    ? 'Create'
                    : 'Save'}
              </button>
            </DetailHeader>

            <div className="agent-editor__section">
              <div className="editor-field">
                <label className="editor-label">Name</label>
                <input
                  className="editor-input"
                  value={form.name}
                  disabled={!isCreating}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      name: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="editor-field">
                <label className="editor-label">Description</label>
                <input
                  className="editor-input"
                  value={form.description}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      description: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="editor-field">
                <label className="editor-label">Body</label>
                <textarea
                  className="editor-textarea editor-textarea--tall editor-textarea--mono"
                  value={form.body}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      body: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="agent-editor__section">
              <details className="editor__expandable">
                <summary className="editor__expandable-header">
                  <span className="editor__section-title">Metadata</span>
                </summary>
                <div className="editor__expandable-content">
                  <div className="editor-field">
                    <label className="editor-label">Category</label>
                    <input
                      className="editor-input"
                      value={form.category}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          category: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="editor-field">
                    <label className="editor-label">Tags</label>
                    <input
                      className="editor-input"
                      value={form.tags}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          tags: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="editor-field">
                    <label className="editor-label">Agent</label>
                    <input
                      className="editor-input"
                      value={form.agent}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          agent: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="editor-field editor-field--row">
                    <input
                      type="checkbox"
                      checked={form.global}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          global: e.target.checked,
                        }))
                      }
                    />
                    <span className="editor-label">Global</span>
                  </div>
                </div>
              </details>
            </div>
          </div>
        )}
      </SplitPaneLayout>
    </div>
  );
}
