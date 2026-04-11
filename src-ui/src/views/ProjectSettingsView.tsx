import {
  useDeleteProjectMutation,
  useProjectQuery,
  useUpdateProjectMutation,
} from '@stallion-ai/sdk';
import { useEffect, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { DetailHeader } from '../components/DetailHeader';
import { ModelSelector } from '../components/ModelSelector';
import { PathAutocomplete } from '../components/PathAutocomplete';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import type { ProjectConfig } from '../contexts/ProjectsContext';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { AgentsSection } from './project-settings/AgentsSection';
import { KnowledgeSection } from './project-settings/KnowledgeSection';
import { LayoutsSection } from './project-settings/LayoutsSection';
import type { ProjectForm } from './project-settings/types';
import { buildProjectForm } from './project-settings/utils';
import './page-layout.css';
import './editor-layout.css';
import './ProjectSettingsView.css';

export function ProjectSettingsView({ slug }: { slug: string }) {
  const { apiBase } = useApiBase();
  const { navigate } = useNavigation();

  const [form, setForm] = useState<ProjectForm | null>(null);
  const [savedForm, setSavedForm] = useState<ProjectForm | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: project, isLoading } = useProjectQuery(slug) as {
    data?: ProjectConfig;
    isLoading: boolean;
  };

  useEffect(() => {
    if (project) {
      const f = buildProjectForm(project);
      setForm(f);
      setSavedForm(f);
    }
  }, [project]);

  const saveMutation = useUpdateProjectMutation({
    onSuccess: (saved) => {
      const f = buildProjectForm(saved);
      setSavedForm(f);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useDeleteProjectMutation({
    onSuccess: () => {
      navigate('/');
    },
    onError: (err: Error) => setError(err.message),
  });

  const isDirty =
    !isLoading && !!form && JSON.stringify(form) !== JSON.stringify(savedForm);
  const { guard, DiscardModal } = useUnsavedGuard(isDirty);

  if (isLoading || !form) {
    return <div className="project-settings__loading">Loading…</div>;
  }

  function setField<K extends keyof ProjectForm>(
    key: K,
    value: ProjectForm[K],
  ) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  return (
    <div className="project-settings">
      {/* Header */}
      <DetailHeader
        title={`${form.icon || project?.icon || ''} ${form.name}`.trim()}
        badge={
          isDirty
            ? { label: 'unsaved', variant: 'warning' as const }
            : undefined
        }
      >
        <button
          className="editor-btn"
          onClick={() => guard(() => navigate(`/projects/${slug}`))}
        >
          ← Back
        </button>
        <button
          className="editor-btn editor-btn--primary"
          disabled={saveMutation.isPending || !form.name}
          onClick={() => saveMutation.mutate({ slug, ...form })}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </DetailHeader>

      {error && <div className="project-settings__error">{error}</div>}

      {/* Body */}
      <div className="project-settings__body">
        {/* Basic Info */}
        <section className="project-settings__section">
          <div className="project-settings__section-title">Basic Info</div>

          <div className="editor-field">
            <label className="editor-label">Name *</label>
            <div className="project-settings__name-row">
              <input
                className="editor-input project-settings__icon-input"
                type="text"
                value={form.icon ?? ''}
                placeholder="🚀"
                onChange={(e) => setField('icon', e.target.value)}
              />
              <input
                className="editor-input project-settings__name-input"
                type="text"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
              />
            </div>
          </div>
          <div className="editor-field">
            <label className="editor-label">Working Directory</label>
            <PathAutocomplete
              apiBase={apiBase}
              value={form.workingDirectory ?? ''}
              onChange={(v) => setField('workingDirectory', v)}
              placeholder="/path/to/project"
            />
          </div>
          <div className="editor-field">
            <label className="editor-label">Description</label>
            <textarea
              className="editor-textarea"
              value={form.description ?? ''}
              rows={2}
              onChange={(e) => setField('description', e.target.value)}
            />
          </div>
        </section>

        {/* Default AI Model */}
        <section className="project-settings__section">
          <div className="project-settings__section-title project-settings__section-title--sm">
            Default AI Model
          </div>
          <div className="editor-field">
            <ModelSelector
              value={form.defaultModel ?? ''}
              onChange={(modelId) => setField('defaultModel', modelId)}
              placeholder="System default"
            />
            <span className="editor-hint">
              Leave empty to use the system default.
            </span>
          </div>
        </section>

        {/* Layouts — list + save as template */}
        <AgentsSection form={form} setForm={setForm} />

        <LayoutsSection slug={slug} />

        {/* Knowledge */}
        <KnowledgeSection slug={slug} />

        {/* Danger Zone */}
        <section className="project-settings__section">
          <div
            className="project-settings__section-title project-settings__section-title--sm"
            style={{ color: 'var(--error-text)' }}
          >
            Danger Zone
          </div>
          <button
            className="editor-btn editor-btn--danger"
            onClick={() => setDeleteOpen(true)}
          >
            Delete Project
          </button>
        </section>
      </div>

      <ConfirmModal
        isOpen={deleteOpen}
        title="Delete Project"
        message={`Delete "${form.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          setDeleteOpen(false);
          deleteMutation.mutate(slug);
        }}
        onCancel={() => setDeleteOpen(false)}
      />

      <DiscardModal />
    </div>
  );
}
