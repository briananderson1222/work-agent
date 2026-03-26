import { useRef, useState } from 'react';
import { log } from '@/utils/logger';
import './ImportPromptsModal.css';

interface ImportPreview {
  name: string;
  description: string;
  file: string;
  prompt: string;
}

interface ImportPromptsModalProps {
  isOpen: boolean;
  onImport: (commands: Record<string, any>) => void;
  onCancel: () => void;
}

function extractMetadata(content: string): {
  description: string;
  title: string;
  cleanContent: string;
} {
  const descMatch = content.match(/^---\s*\ndescription:\s*(.+?)\n---/s);
  const titleMatch = content.match(/^#\s+(.+?)$/m);

  const cleanContent = descMatch
    ? content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '')
    : content;

  return {
    description: descMatch?.[1]?.trim() || '',
    title: titleMatch?.[1]?.trim() || '',
    cleanContent,
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

      try {
        const content = await file.text();
        const { description, title, cleanContent } = extractMetadata(content);

        const commandName = file.name.replace('.md', '');

        previews.push({
          name: commandName,
          description: description || title,
          file: file.name,
          prompt: cleanContent,
        });
      } catch (err) {
        log.api(`Failed to read ${file.name}:`, err);
      }
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
    const commands: Record<string, any> = {};

    for (const item of preview) {
      commands[item.name] = {
        name: item.name,
        description: item.description,
        prompt: item.prompt,
      };
    }

    onImport(commands);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-dialog import-modal__dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>📁 Import Markdown</h3>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Select Markdown Files</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              multiple
              onChange={handleFileSelect}
              hidden
            />
            <button
              type="button"
              className="button button--secondary import-modal__file-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              📂 Choose Files
            </button>
          </div>

          {isLoading ? (
            <div className="import-modal__loading">Loading files...</div>
          ) : preview.length > 0 ? (
            <div>
              <div className="import-modal__preview-header">
                <strong className="import-modal__preview-title">
                  Preview ({preview.length} commands)
                </strong>
              </div>
              <div className="import-modal__preview-list">
                {preview.map((item, i) => (
                  <div key={i} className="import-modal__preview-item">
                    <div className="import-modal__name-row">
                      <code className="import-modal__slash">/</code>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) =>
                          updatePreview(i, 'name', e.target.value)
                        }
                        className="import-modal__name-input"
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
                      placeholder="No description"
                      className="import-modal__desc-input"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="import-modal__empty">
              Select markdown files to preview
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="button button--secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={handleImport}
            disabled={preview.length === 0 || isLoading}
          >
            Import {preview.length > 0 ? `${preview.length} Commands` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
