import { useRef, useState } from 'react';
import './ImportPromptsModal.css';

interface ImportPreview {
  name: string;
  description: string;
  content: string;
  file: string;
  category?: string;
  tags?: string[];
  agent?: string;
  global?: boolean;
  storageMode?: 'json-inline' | 'markdown-file';
}

interface ImportPromptsModalProps {
  isOpen: boolean;
  onImport: (
    items: {
      name: string;
      content: string;
      description?: string;
      category?: string;
      tags?: string[];
      agent?: string;
      global?: boolean;
      storageMode?: 'json-inline' | 'markdown-file';
    }[],
  ) => void;
  onCancel: () => void;
}

function parseFrontmatter(text: string): {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  agent?: string;
  global?: boolean;
  content: string;
} {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { content: text };
  const meta: Record<string, any> = {};
  let currentArrayKey: string | null = null;
  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    if (currentArrayKey && line.trim().startsWith('- ')) {
      meta[currentArrayKey] ??= [];
      meta[currentArrayKey].push(
        line
          .trim()
          .slice(2)
          .replace(/^["']|["']$/g, ''),
      );
      continue;
    }
    currentArrayKey = null;
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!value) {
      currentArrayKey = key;
      continue;
    }
    if (value === 'true' || value === 'false') {
      meta[key] = value === 'true';
    } else {
      meta[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return {
    name: meta.name,
    description: meta.description,
    category: meta.category,
    tags: meta.tags,
    agent: meta.agent,
    global: meta.global,
    content: match[2].trim(),
  };
}

export function ImportPromptsModal({
  isOpen,
  onImport,
  onCancel,
}: ImportPromptsModalProps) {
  const [preview, setPreview] = useState<ImportPreview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setIsLoading(true);
    const previews: ImportPreview[] = [];
    for (const file of files) {
      if (!file.name.endsWith('.md')) continue;
      const text = await file.text();
      const parsed = parseFrontmatter(text);
      previews.push({
        name: parsed.name || file.name.replace(/\.md$/, ''),
        description: parsed.description || '',
        category: parsed.category,
        tags: parsed.tags,
        agent: parsed.agent,
        global: parsed.global,
        storageMode: 'markdown-file',
        content: parsed.content,
        file: file.name,
      });
    }
    setPreview(previews);
    setIsLoading(false);
  };

  const updatePreview = (
    index: number,
    field: 'name' | 'description',
    value: string,
  ) => {
    const updated = [...preview];
    updated[index] = { ...updated[index], [field]: value };
    setPreview(updated);
  };

  const handleImport = () => {
    onImport(
      preview.map(
        ({
          name,
          content,
          description,
          category,
          tags,
          agent,
          global,
          storageMode,
        }) => ({
          name,
          content,
          description: description || undefined,
          category,
          tags,
          agent,
          global,
          storageMode,
        }),
      ),
    );
    setPreview([]);
  };

  const handleCancel = () => {
    setPreview([]);
    onCancel();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div
        className="modal-dialog import-modal__dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Import Prompts</h3>
        </div>
        <div className="modal-body">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md"
            multiple
            onChange={handleFileSelect}
            hidden
          />
          {preview.length === 0 && !isLoading && (
            <button
              type="button"
              className="editor-btn import-modal__file-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose .md files
            </button>
          )}

          {isLoading ? (
            <div className="import-modal__loading">Reading files...</div>
          ) : preview.length > 0 ? (
            <>
              <div className="import-modal__preview-header">
                <strong className="import-modal__preview-title">
                  {preview.length} prompt{preview.length !== 1 ? 's' : ''} to
                  import
                </strong>
                <button
                  type="button"
                  className="editor-btn editor-btn--small"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Add more
                </button>
              </div>
              <div className="import-modal__preview-list">
                {preview.map((item, i) => (
                  <div key={i} className="import-modal__preview-item">
                    <div className="import-modal__name-row">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) =>
                          updatePreview(i, 'name', e.target.value)
                        }
                        className="import-modal__name-input"
                        placeholder="Prompt name"
                      />
                      <span className="import-modal__file-label">
                        {item.file}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        updatePreview(i, 'description', e.target.value)
                      }
                      placeholder="Description (optional)"
                      className="import-modal__desc-input"
                    />
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <div className="modal-footer">
          <button type="button" className="editor-btn" onClick={handleCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="editor-btn editor-btn--primary"
            onClick={handleImport}
            disabled={preview.length === 0 || isLoading}
          >
            Import {preview.length > 0 ? preview.length : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
