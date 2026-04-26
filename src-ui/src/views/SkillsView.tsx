import type { Skill } from '@stallion-ai/contracts/catalog';
import { skillToGuidanceAsset } from '@stallion-ai/contracts/guidance-assets';
import {
  useConvertSkillToPlaybookMutation,
  useCreateLocalSkillMutation,
  useSkillQuery,
  useSkillsQuery,
  useUninstallSkillMutation,
  useUpdateLocalSkillMutation,
} from '@stallion-ai/sdk';
import { useEffect, useMemo, useState } from 'react';
import { DetailHeader } from '../components/DetailHeader';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useNavigation } from '../contexts/NavigationContext';
import { useToast } from '../contexts/ToastContext';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { useUrlSelection } from '../hooks/useUrlSelection';
import { GuidanceConversionModal } from './GuidanceConversionModal';
import { GuidanceTabs } from './GuidanceTabs';
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
  const [showConvertToPlaybookModal, setShowConvertToPlaybookModal] =
    useState(false);
  const [dirty, setDirty] = useState(false);
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

  const skills = localSkills;

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
  const selectedSkillName =
    !isCreating && selected?.installed ? selected.name : undefined;
  const { data: selectedSkillDetail } = useSkillQuery(selectedSkillName, {
    enabled: !!selectedSkillName,
  });

  const createLocalMutation = useCreateLocalSkillMutation();
  const uninstallMutation = useUninstallSkillMutation();
  const updateLocalMutation = useUpdateLocalSkillMutation();
  const convertToPlaybookMutation = useConvertSkillToPlaybookMutation();
  const { guard, DiscardModal } = useUnsavedGuard(dirty);

  useEffect(() => {
    setIsCreating(rawSelectedId === 'new');
  }, [rawSelectedId]);

  useEffect(() => {
    if (isCreating) {
      setForm(EMPTY_SKILL_FORM);
      setDirty(false);
      return;
    }
    if (selectedSkillDetail) {
      setForm({
        name: selectedSkillDetail.name ?? '',
        description: selectedSkillDetail.description ?? '',
        body: selectedSkillDetail.body ?? '',
        tags: Array.isArray(selectedSkillDetail.tags)
          ? selectedSkillDetail.tags.join(', ')
          : '',
        category: selectedSkillDetail.category ?? '',
        agent: selectedSkillDetail.agent ?? '',
        global: !!selectedSkillDetail.global,
      });
      setDirty(false);
    }
  }, [selectedSkillDetail, isCreating]);

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
      setDirty(false);
      showToast('Skill saved');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to save skill',
      );
    }
  }

  function updateForm(updates: Partial<SkillForm>) {
    setForm((current) => ({
      ...current,
      ...updates,
    }));
    setDirty(true);
  }

  function handleSelectSkill(id: string) {
    guard(() => {
      select(id);
      setIsCreating(false);
      setDirty(false);
    });
  }

  function handleDeselectSkill() {
    guard(() => {
      deselect();
      setIsCreating(false);
      setDirty(false);
    });
  }

  function handleAddSkill() {
    guard(() => {
      select('new');
      setIsCreating(true);
      setForm(EMPTY_SKILL_FORM);
      setDirty(false);
    });
  }

  function navigateWithGuard(path: string) {
    guard(() => navigate(path));
  }

  const editableLocal =
    isCreating || (selected?.installed && selected.source === 'local');
  const hasSelectedSkillBody = !!selectedSkillDetail?.body?.trim();

  return (
    <div className="page page--full">
      <GuidanceTabs active="skills" onNavigate={navigateWithGuard} />
      <SplitPaneLayout
        label="skills"
        title="Skills"
        subtitle="Capabilities available to agents"
        items={items}
        loading={isLoading}
        selectedId={splitPaneSelectedId}
        onSelect={handleSelectSkill}
        onDeselect={handleDeselectSkill}
        onSearch={setSearch}
        searchPlaceholder="Search skills..."
        onAdd={handleAddSkill}
        addLabel="+ New Skill"
        listEmptyTitle="No skills yet"
        listEmptyDescription="Create a skill to add reusable capabilities that agents can select."
        sidebarActions={
          <button
            className="split-pane__add-btn split-pane__add-btn--secondary"
            onClick={() => navigateWithGuard('/playbooks')}
          >
            Open Playbooks
          </button>
        }
        emptyIcon="⚡"
        emptyTitle="No skill selected"
        emptyDescription="Select a skill to view details"
      >
        {(editableLocal || selected) && (
          <div className="skill-detail">
            <DetailHeader
              title={isCreating ? 'New Skill' : form.name || 'Edit Skill'}
              badge={
                dirty
                  ? { label: 'unsaved', variant: 'warning' as const }
                  : undefined
              }
            >
              {!isCreating && selected && (
                <button
                  className="editor-btn"
                  onClick={() => setShowConvertToPlaybookModal(true)}
                  disabled={!hasSelectedSkillBody}
                >
                  Create Playbook
                </button>
              )}
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
              {editableLocal && (
                <button
                  className="editor-btn editor-btn--primary"
                  onClick={handleSaveLocalSkill}
                  disabled={
                    createLocalMutation.isPending ||
                    updateLocalMutation.isPending
                  }
                >
                  {createLocalMutation.isPending ||
                  updateLocalMutation.isPending
                    ? 'Saving…'
                    : isCreating
                      ? 'Create'
                      : 'Save'}
                </button>
              )}
            </DetailHeader>

            {!isCreating && selected && (
              <div className="agent-editor__section">
                <div className="skill-detail__meta">
                  <span>Source: {selected.source || 'local'}</span>
                  {selected.path && <span>Path: {selected.path}</span>}
                </div>
              </div>
            )}

            <div className="agent-editor__section">
              <div className="editor-field">
                <label className="editor-label">Name</label>
                <input
                  className="editor-input"
                  value={form.name}
                  disabled={!isCreating}
                  onChange={(e) => updateForm({ name: e.target.value })}
                />
              </div>
              <div className="editor-field">
                <label className="editor-label">Description</label>
                <input
                  className="editor-input"
                  value={form.description}
                  disabled={!editableLocal}
                  onChange={(e) => updateForm({ description: e.target.value })}
                />
              </div>
              <div className="editor-field">
                <label className="editor-label">Body</label>
                <textarea
                  className="editor-textarea editor-textarea--tall editor-textarea--mono"
                  value={form.body}
                  disabled={!editableLocal}
                  onChange={(e) => updateForm({ body: e.target.value })}
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
                      disabled={!editableLocal}
                      onChange={(e) => updateForm({ category: e.target.value })}
                    />
                  </div>
                  <div className="editor-field">
                    <label className="editor-label">Tags</label>
                    <input
                      className="editor-input"
                      value={form.tags}
                      disabled={!editableLocal}
                      onChange={(e) => updateForm({ tags: e.target.value })}
                    />
                  </div>
                  <div className="editor-field">
                    <label className="editor-label">Agent</label>
                    <input
                      className="editor-input"
                      value={form.agent}
                      disabled={!editableLocal}
                      onChange={(e) => updateForm({ agent: e.target.value })}
                    />
                  </div>
                  <div className="editor-field editor-field--row">
                    <input
                      type="checkbox"
                      checked={form.global}
                      disabled={!editableLocal}
                      onChange={(e) => updateForm({ global: e.target.checked })}
                    />
                    <span className="editor-label">Global</span>
                  </div>
                </div>
              </details>
            </div>
          </div>
        )}
      </SplitPaneLayout>
      <GuidanceConversionModal
        isOpen={showConvertToPlaybookModal}
        title="Create Playbook From Skill"
        sourceName={form.name}
        destinationLabel="Playbook"
        confirmLabel="Create Playbook"
        defaultName={form.name}
        pending={convertToPlaybookMutation.isPending}
        notes={[
          'Body, description, tags, category, and scope are copied.',
          'The Skill remains unchanged.',
          'The new Playbook records this Skill as its source.',
        ]}
        onCancel={() => setShowConvertToPlaybookModal(false)}
        onConfirm={(playbookName) => {
          if (!form.name) return;
          convertToPlaybookMutation.mutate(
            { name: form.name, playbookName },
            {
              onSuccess: (playbook: any) => {
                setShowConvertToPlaybookModal(false);
                showToast('Playbook created');
                navigate(`/playbooks/${encodeURIComponent(playbook.id)}`);
              },
              onError: (error) =>
                showToast(
                  error instanceof Error
                    ? error.message
                    : 'Failed to create playbook',
                ),
            },
          );
        }}
      />
      <DiscardModal />
    </div>
  );
}
