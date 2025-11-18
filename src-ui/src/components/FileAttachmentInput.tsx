import { useRef, useState, useEffect } from 'react';
import type { FileAttachment } from '../types';

interface FileAttachmentInputProps {
  attachments: FileAttachment[];
  onAdd: (files: FileAttachment[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
  supportsImages?: boolean;
  supportsFiles?: boolean;
  compact?: boolean;
}

export function FileAttachmentInput({
  attachments,
  onAdd,
  onRemove,
  disabled,
  supportsImages,
  supportsFiles,
  compact = false,
}: FileAttachmentInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const clearAllRef = useRef<HTMLButtonElement>(null);
  const previewModalRef = useRef<HTMLDivElement>(null);
  const attachButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (showPreview && clearAllRef.current) {
      clearAllRef.current.focus();
    }
  }, [showPreview]);

  useEffect(() => {
    if (previewImage && previewModalRef.current) {
      previewModalRef.current.focus();
    }
  }, [previewImage]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewImage) {
          setPreviewImage(null);
        } else if (showPreview) {
          setShowPreview(false);
          attachButtonRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [previewImage, showPreview]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newAttachments: FileAttachment[] = [];

    for (const file of files) {
      const reader = new FileReader();
      const attachment = await new Promise<FileAttachment>((resolve) => {
        reader.onload = () => {
          const base64 = reader.result as string;
          const isImage = file.type.startsWith('image/');
          
          resolve({
            id: `${Date.now()}-${Math.random()}`,
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64,
            preview: isImage ? base64 : undefined,
          });
        };
        reader.readAsDataURL(file);
      });

      newAttachments.push(attachment);
    }

    onAdd(newAttachments);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Focus attach button after selection
    setTimeout(() => attachButtonRef.current?.focus(), 0);
  };

  const accept = [];
  if (supportsImages) accept.push('image/*');
  if (supportsFiles) accept.push('.pdf,.txt,.csv,.md,.json');

  const canAttach = supportsImages || supportsFiles;

  if (!canAttach) return null;

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept.join(',')}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        disabled={disabled || !canAttach}
      />
      
      <button
        ref={attachButtonRef}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        disabled={disabled}
        tabIndex={0}
        style={{
          background: 'none',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: attachments.length > 0 ? 'var(--color-primary)' : 'var(--text-muted)',
          padding: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 0.7,
          transition: 'opacity 0.2s, color 0.2s',
          position: 'relative',
          height: '100%',
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.opacity = '1';
            if (attachments.length > 0) setShowPreview(true);
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.opacity = '0.7';
            setShowPreview(false);
          }
        }}
        title="Attach files"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        {attachments.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowPreview(prev => !prev);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                setShowPreview(prev => !prev);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setShowPreview(false);
              }
            }}
            onMouseEnter={(e) => {
              e.stopPropagation();
              setShowPreview(true);
            }}
            tabIndex={0}
            style={{
              position: 'absolute',
              top: '50%',
              right: '2px',
              transform: 'translateY(-125%)',
              background: 'var(--color-primary)',
              color: 'var(--bg-primary)',
              borderRadius: '50%',
              width: '14px',
              height: '14px',
              fontSize: '9px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
            title={`View ${attachments.length} attachment${attachments.length !== 1 ? 's' : ''}`}
          >
            {attachments.length}
          </button>
        )}
      </button>

      {showPreview && attachments.length > 0 && (
        <div
          role="dialog"
          onMouseEnter={() => setShowPreview(true)}
          onMouseLeave={() => setShowPreview(false)}
          style={{
            position: 'fixed',
            bottom: '80px',
            right: '20px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '8px',
            padding: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 10000,
            minWidth: '280px',
            maxWidth: '400px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
              {attachments.length} Attachment{attachments.length !== 1 ? 's' : ''}
            </div>
            <button
              ref={clearAllRef}
              onClick={(e) => {
                e.stopPropagation();
                attachments.forEach(att => onRemove(att.id));
                setShowPreview(false);
                setTimeout(() => attachButtonRef.current?.focus(), 0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  attachments.forEach(att => onRemove(att.id));
                  setShowPreview(false);
                  setTimeout(() => attachButtonRef.current?.focus(), 0);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const firstItem = e.currentTarget.closest('[role="dialog"]')?.querySelector('[data-attachment] img, [data-attachment] button');
                  (firstItem as HTMLElement)?.focus();
                }
              }}
              tabIndex={0}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                color: 'var(--color-primary)',
                fontWeight: 600,
                padding: '2px 4px',
              }}
            >
              Clear All
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {attachments.map((att, idx) => (
              <div
                key={att.id}
                data-attachment
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '4px',
                }}
              >
                {att.preview ? (
                  <img
                    src={att.preview}
                    alt={att.name}
                    onClick={() => setPreviewImage(att.preview!)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setPreviewImage(att.preview!);
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const next = e.currentTarget.closest('[data-attachment]')?.nextElementSibling?.querySelector('img, button');
                        (next as HTMLElement)?.focus();
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prev = e.currentTarget.closest('[data-attachment]')?.previousElementSibling?.querySelector('img, button');
                        if (prev) {
                          (prev as HTMLElement).focus();
                        } else {
                          // Go back to Clear All button
                          const clearAll = e.currentTarget.closest('[role="dialog"]')?.querySelector('button');
                          (clearAll as HTMLElement)?.focus();
                        }
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    style={{
                      width: '48px',
                      height: '48px',
                      objectFit: 'cover',
                      borderRadius: '4px',
                      flexShrink: 0,
                      cursor: 'pointer',
                      outline: 'none',
                      border: '2px solid transparent',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'transparent'}
                    title="Click to preview"
                  />
                ) : (
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--bg-tertiary)',
                      borderRadius: '4px',
                      fontSize: '24px',
                      flexShrink: 0,
                    }}
                  >
                    📄
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {(att.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(att.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onRemove(att.id);
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      const next = e.currentTarget.closest('[data-attachment]')?.nextElementSibling?.querySelector('img, button');
                      (next as HTMLElement)?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      const prev = e.currentTarget.closest('[data-attachment]')?.previousElementSibling?.querySelector('img, button');
                      (prev as HTMLElement)?.focus();
                    }
                  }}
                  tabIndex={0}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: 'var(--text-muted)',
                    fontSize: '18px',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {previewImage && (
        <div
          ref={previewModalRef}
          onClick={() => {
            setPreviewImage(null);
            attachButtonRef.current?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setPreviewImage(null);
              attachButtonRef.current?.focus();
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              const currentIdx = attachments.findIndex(a => a.preview === previewImage);
              if (currentIdx > 0) {
                setPreviewImage(attachments[currentIdx - 1].preview!);
              }
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              const currentIdx = attachments.findIndex(a => a.preview === previewImage);
              if (currentIdx < attachments.length - 1 && attachments[currentIdx + 1].preview) {
                setPreviewImage(attachments[currentIdx + 1].preview!);
              }
            }
          }}
          tabIndex={0}
          role="dialog"
          aria-label="Image preview"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {(() => {
            const currentIdx = attachments.findIndex(a => a.preview === previewImage);
            const hasPrev = currentIdx > 0;
            const hasNext = currentIdx < attachments.length - 1 && attachments[currentIdx + 1]?.preview;
            
            return (
              <>
                {hasPrev && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewImage(attachments[currentIdx - 1].preview!);
                    }}
                    style={{
                      position: 'absolute',
                      left: '20px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '32px',
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1,
                      opacity: 0.9,
                    }}
                    title="Previous (←)"
                  >
                    ‹
                  </button>
                )}
                <img
                  src={previewImage}
                  alt="Preview"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    maxWidth: '90vw',
                    maxHeight: '90vh',
                    objectFit: 'contain',
                    borderRadius: '8px',
                  }}
                />
                {hasNext && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewImage(attachments[currentIdx + 1].preview!);
                    }}
                    style={{
                      position: 'absolute',
                      right: '20px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '32px',
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1,
                      opacity: 0.9,
                    }}
                    title="Next (→)"
                  >
                    ›
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
