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
  const [addCodingLayout, setAddCodingLayout] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const normalizedDirectory = directory.trim().replace(/\/+$/, '');
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
      setAddCodingLayout(false);
      setSelectedTemplate('');
      setError(null);
    }
  }, [isOpen]);

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
    if (!name.trim()) return;
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
        name: name.trim(),
        slug: slugify(name.trim()),
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '500px',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            margin: '0 0 20px',
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          New Project
        </h3>

        <form onSubmit={handleCreate}>
          <div className="editor-field">
            <label className="editor-label">Name *</label>
            <input
              className="editor-input"
              type="text"
              value={name}
              placeholder="My Project"
              autoFocus
              required
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="editor-field">
            <label className="editor-label">
              Icon{' '}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                (emoji, optional)
              </span>
            </label>
            <input
              className="editor-input"
              type="text"
              value={icon}
              placeholder="🚀"
              onChange={(e) => setIcon(e.target.value)}
            />
          </div>

          <div className="editor-field">
            <label className="editor-label">
              Description{' '}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                (optional)
              </span>
            </label>
            <textarea
              className="editor-textarea"
              value={description}
              placeholder="A brief description"
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="editor-field">
            <label className="editor-label">
              Working Directory{' '}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                (optional)
              </span>
            </label>
            <PathAutocomplete
              apiBase={apiBase}
              value={directory}
              onChange={setDirectory}
              placeholder="/path/to/project"
            />
          </div>

          {directory.trim() && (
            <div
              className="editor-field"
              style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}
            >
              <input
                id="add-coding-layout"
                type="checkbox"
                checked={addCodingLayout}
                onChange={(e) => setAddCodingLayout(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label
                htmlFor="add-coding-layout"
                style={{
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  margin: 0,
                }}
              >
                Add Coding Layout
              </label>
            </div>
          )}

          {templates.length > 0 && (
            <div className="editor-field">
              <label className="editor-label">
                Layout Template{' '}
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                  (optional)
                </span>
              </label>
              <select
                className="editor-input"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                style={{ cursor: 'pointer' }}
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

          {error && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                background: 'var(--error-bg)',
                border: '1px solid var(--error-border)',
                borderRadius: '6px',
                color: 'var(--error-text)',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '8px',
            }}
          >
            <button type="button" className="editor-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="editor-btn editor-btn--primary"
              disabled={submitting || !name.trim()}
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
