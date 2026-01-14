import { useState, useRef } from 'react';
import { log } from '@/utils/logger';

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

function extractMetadata(content: string): { description: string; title: string; cleanContent: string } {
  const descMatch = content.match(/^---\s*\ndescription:\s*(.+?)\n---/s);
  const titleMatch = content.match(/^#\s+(.+?)$/m);
  
  // Remove frontmatter if present
  const cleanContent = descMatch 
    ? content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '')
    : content;
  
  return {
    description: descMatch?.[1]?.trim() || '',
    title: titleMatch?.[1]?.trim() || '',
    cleanContent
  };
}

export function ImportPromptsModal({ isOpen, onImport, onCancel }: ImportPromptsModalProps) {
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
          prompt: cleanContent
        });
      } catch (err) {
        log.api(`Failed to read ${file.name}:`, err);
      }
    }
    
    setPreview(previews);
    setIsLoading(false);
  };

  const updatePreview = (index: number, field: 'name' | 'description', value: string) => {
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
        prompt: item.prompt
      };
    }
    
    onImport(commands);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
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
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="button button--secondary"
              onClick={() => fileInputRef.current?.click()}
              style={{ width: '100%' }}
            >
              📂 Choose Files
            </button>
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
              Loading files...
            </div>
          ) : preview.length > 0 ? (
            <div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '12px'
              }}>
                <strong style={{ fontSize: '14px' }}>Preview ({preview.length} commands)</strong>
              </div>
              <div style={{ 
                maxHeight: '300px', 
                overflowY: 'auto',
                border: '1px solid var(--border-primary)',
                borderRadius: '6px'
              }}>
                {preview.map((item, i) => (
                  <div 
                    key={i}
                    style={{
                      padding: '12px',
                      borderBottom: i < preview.length - 1 ? '1px solid var(--border-primary)' : 'none',
                      background: i % 2 === 0 ? 'var(--bg-secondary)' : 'transparent'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <code style={{ fontSize: '13px', fontWeight: 600 }}>
                        /
                      </code>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updatePreview(i, 'name', e.target.value)}
                        style={{
                          padding: '2px 4px',
                          fontSize: '13px',
                          fontWeight: 600,
                          fontFamily: 'monospace',
                          color: 'var(--color-primary)',
                          border: '1px solid transparent',
                          borderRadius: '3px',
                          background: 'transparent',
                          outline: 'none',
                          transition: 'all 0.15s'
                        }}
                        onFocus={(e) => {
                          e.target.style.border = '1px solid var(--color-primary)';
                          e.target.style.background = 'var(--bg-primary)';
                        }}
                        onBlur={(e) => {
                          e.target.style.border = '1px solid transparent';
                          e.target.style.background = 'transparent';
                        }}
                      />
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {item.file}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updatePreview(i, 'description', e.target.value)}
                      placeholder="No description"
                      style={{
                        width: '100%',
                        padding: '2px 4px',
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        border: '1px solid transparent',
                        borderRadius: '3px',
                        background: 'transparent',
                        outline: 'none',
                        transition: 'all 0.15s'
                      }}
                      onFocus={(e) => {
                        e.target.style.border = '1px solid var(--border-primary)';
                        e.target.style.background = 'var(--bg-primary)';
                      }}
                      onBlur={(e) => {
                        e.target.style.border = '1px solid transparent';
                        e.target.style.background = 'transparent';
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '24px', 
              color: 'var(--text-muted)',
              border: '2px dashed var(--border-primary)',
              borderRadius: '6px'
            }}>
              Select markdown files to preview
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button button--secondary" onClick={onCancel}>
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
