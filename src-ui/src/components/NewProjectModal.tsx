import {
  useCreateProjectLayoutMutation,
  useCreateProjectMutation,
  useFileSystemBrowseQuery,
  useTemplatesQuery,
} from '@stallion-ai/sdk';
import { useEffect, useState } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { PathAutocomplete } from './PathAutocomplete';
import {
  getWorkingDirectoryLeaf,
  inferProjectIconFromPath,
  inferProjectNameFromPath,
  normalizeWorkingDirectory,
} from './project-form-utils';
import './NewProjectModal.css';

export interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function NewProjectModal({ isOpen, onClose }: NewProjectModalProps) {
  const { apiBase } = useApiBase();
  const { setProject } = useNavigation();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [directory, setDirectory] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [iconTouched, setIconTouched] = useState(false);
  const [addCodingLayout, setAddCodingLayout] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const normalizedDirectory = normalizeWorkingDirectory(directory);
  const derivedName = inferProjectNameFromPath(normalizedDirectory);
  const directoryLeaf = getWorkingDirectoryLeaf(normalizedDirectory);
  const [error, setError] = useState<string | null>(null);
  const createProjectMutation = useCreateProjectMutation();
  const createProjectLayoutMutation = useCreateProjectLayoutMutation();
  const { data: templates = [] } = useTemplatesQuery(undefined, {
    enabled: isOpen,
  }) as {
    data?: Array<{
      id: string;
      name: string;
      icon?: string;
      type: string;
      description?: string;
      config?: Record<string, unknown>;
    }>;
  };
  const { refetch: validateDirectory } = useFileSystemBrowseQuery(
    normalizedDirectory || undefined,
    { enabled: false },
  );
  const submitting =
    createProjectMutation.isPending || createProjectLayoutMutation.isPending;

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setIcon('');
      setDescription('');
      setDirectory('');
      setNameTouched(false);
      setIconTouched(false);
      setAddCodingLayout(false);
      setSelectedTemplate('');
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || nameTouched) return;
    setName(derivedName);
  }, [derivedName, isOpen, nameTouched]);

  useEffect(() => {
    if (!isOpen || iconTouched) return;

    if (!normalizedDirectory) {
      setIcon('');
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      const result = await validateDirectory();
      if (cancelled) return;
      const entries = result.data?.entries ?? [];
      setIcon(inferProjectIconFromPath(normalizedDirectory, entries));
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [iconTouched, isOpen, normalizedDirectory, validateDirectory]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const resolvedName = name.trim() || derivedName;
    if (!resolvedName) return;
    setError(null);
    try {
      const dir = normalizedDirectory;
      if (dir) {
        const result = await validateDirectory();
        if (result.error) {
          throw result.error;
        }
      }
      const project = await createProjectMutation.mutateAsync({
        name: resolvedName,
        slug: slugify(resolvedName),
        icon: icon.trim() || undefined,
        description: description.trim() || undefined,
        workingDirectory: dir || undefined,
      });

      const projectSlug = project.slug;

      if (addCodingLayout && dir) {
        await createProjectLayoutMutation.mutateAsync({
          projectSlug,
          type: 'coding',
          name: 'Coding',
          slug: 'coding',
          icon: '🔧',
          config: { workingDirectory: dir },
        });
      }

      // Apply selected template as an additional layout
      if (selectedTemplate) {
        const tmpl = templates.find((t) => t.id === selectedTemplate);
        if (tmpl) {
          await createProjectLayoutMutation.mutateAsync({
            projectSlug,
            type: tmpl.type,
            name: tmpl.name,
            slug: tmpl.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, ''),
            icon: tmpl.icon,
            config: tmpl.config ?? {},
          });
        }
      }

      setProject(projectSlug);
      onClose();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="new-project-modal__overlay" onClick={onClose}>
      <div className="new-project-modal" onClick={(e) => e.stopPropagation()}>
        <div className="new-project-modal__header">
          <div>
            <p className="new-project-modal__eyebrow">Project Setup</p>
            <h3 className="new-project-modal__title">New Project</h3>
            <p className="new-project-modal__subtitle">
              Start with the workspace folder. The project name follows the
              selected path until you edit it, and the icon gets a best-effort
              suggestion from the folder shape.
            </p>
          </div>
          <button
            className="new-project-modal__close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form className="new-project-modal__form" onSubmit={handleCreate}>
          <div className="new-project-modal__hero">
            <section className="new-project-modal__panel new-project-modal__panel--featured">
              <h4 className="new-project-modal__panel-title">
                Working directory first
              </h4>
              <p className="new-project-modal__panel-copy">
                Point Stallion at the folder you actually want to work in. The
                project metadata can be refined after the path is chosen.
              </p>
              <div className="editor-field">
                <label className="editor-label">
                  Working Directory
                  <span className="editor-hint"> optional</span>
                </label>
                <PathAutocomplete
                  apiBase={apiBase}
                  value={directory}
                  onChange={setDirectory}
                  placeholder="/path/to/project"
                  className="editor-input path-autocomplete__input new-project-modal__working-dir-input"
                />
              </div>
              {normalizedDirectory && (
                <div className="new-project-modal__working-dir-meta">
                  <span className="new-project-modal__meta-pill">
                    leaf <code>{directoryLeaf || 'project'}</code>
                  </span>
                  <span className="new-project-modal__meta-pill">
                    create as <code>{derivedName || 'Untitled'}</code>
                  </span>
                </div>
              )}
            </section>

            <aside className="new-project-modal__panel">
              <div className="new-project-modal__preview">
                <span className="new-project-modal__preview-badge">
                  Preview
                </span>
                <div className="new-project-modal__preview-card">
                  <span className="new-project-modal__preview-icon">
                    {icon || '📁'}
                  </span>
                  <div>
                    <p className="new-project-modal__preview-name">
                      {name || derivedName || 'Untitled Project'}
                    </p>
                    <p className="new-project-modal__preview-path">
                      {normalizedDirectory ||
                        'No working directory selected yet'}
                    </p>
                  </div>
                </div>
                <p className="new-project-modal__preview-caption">
                  Use the suggested metadata as a starting point, then override
                  either field if the folder name is not the right label.
                </p>
              </div>
            </aside>
          </div>

          <div className="new-project-modal__section-grid">
            <div className="editor-field">
              <label className="editor-label">Name *</label>
              <input
                className="editor-input"
                type="text"
                value={name}
                placeholder="My Project"
                required
                onChange={(e) => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
              />
            </div>
            <div className="editor-field">
              <label className="editor-label">Icon</label>
              <input
                className="editor-input new-project-modal__icon-input"
                type="text"
                value={icon}
                placeholder="📁"
                onChange={(e) => {
                  setIconTouched(true);
                  setIcon(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="editor-field">
            <label className="editor-label">
              Description <span className="editor-hint">optional</span>
            </label>
            <textarea
              className="editor-textarea"
              value={description}
              placeholder="A short note about what lives in this workspace."
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {normalizedDirectory && (
            <div className="new-project-modal__checkbox">
              <input
                id="add-coding-layout"
                type="checkbox"
                checked={addCodingLayout}
                onChange={(e) => setAddCodingLayout(e.target.checked)}
              />
              <label htmlFor="add-coding-layout">
                Add the default coding layout for this directory
              </label>
            </div>
          )}

          {templates.length > 0 && (
            <div className="editor-field">
              <label className="editor-label">
                Layout Template <span className="editor-hint">optional</span>
              </label>
              <select
                className="editor-input"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
              >
                <option value="">None</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.icon ? `${t.icon} ` : ''}
                    {t.name}
                    {t.description ? ` — ${t.description}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <div className="new-project-modal__error">{error}</div>}

          <div className="new-project-modal__actions">
            <button type="button" className="editor-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="editor-btn editor-btn--primary"
              disabled={submitting || !(name.trim() || derivedName)}
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
