import { useEffect } from 'react';
import { useFileAttachment } from '../hooks/useFileAttachment';
import { AttachmentPreviewMenu } from './AttachmentPreviewMenu';
import { usePreview } from '../contexts/PreviewContext';
import type { FileAttachment } from '../types';

interface FileAttachmentInputProps {
  attachments: FileAttachment[];
  onAdd: (files: FileAttachment[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
  supportsImages?: boolean;
  supportsFiles?: boolean;
}

export function FileAttachmentInput({
  attachments,
  onAdd,
  onRemove,
  disabled,
  supportsImages,
  supportsFiles,
}: FileAttachmentInputProps) {
  const { openPreview } = usePreview();
  const {
    fileInputRef,
    attachButtonRef,
    showPreview,
    setShowPreview,
    showMenu,
    hideMenu,
    handleFileSelect,
    openFilePicker,
  } = useFileAttachment({ onAdd });

  // Escape key handling
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showPreview) {
        setShowPreview(false);
        attachButtonRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showPreview, setShowPreview, attachButtonRef]);

  const accept = [];
  if (supportsImages) accept.push('image/*');
  if (supportsFiles) accept.push('.pdf,.txt,.csv,.md,.json');

  const canAttach = supportsImages || supportsFiles;

  const handleClearAll = () => {
    attachments.forEach(att => onRemove(att.id));
    setShowPreview(false);
    setTimeout(() => attachButtonRef.current?.focus(), 0);
  };

  const handlePreviewImage = (preview: string) => {
    const att = attachments.find(a => a.preview === preview);
    const allPreviewable = attachments
      .filter(a => a.preview && a.type.startsWith('image/'))
      .map(a => ({ url: a.preview!, mediaType: a.type, name: a.name }));
    openPreview({ url: preview, mediaType: att?.type || 'image/png', name: att?.name }, allPreviewable);
  };

  return (
    <div className="attachment-wrapper">
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
        className={`attachment-btn ${attachments.length > 0 ? 'has-attachments' : ''}`}
        onClick={openFilePicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openFilePicker();
          } else if (e.key === 'ArrowUp' && attachments.length > 0) {
            e.preventDefault();
            setShowPreview(true);
          }
        }}
        disabled={disabled}
        tabIndex={0}
        onMouseEnter={() => {
          if (!disabled && attachments.length > 0) showMenu();
        }}
        onMouseLeave={() => {
          if (!disabled) hideMenu();
        }}
        title={disabled && !canAttach ? "Current model doesn't support attachments" : "Attach files"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        {attachments.length > 0 && (
          <span className="attachment-btn__badge">{attachments.length}</span>
        )}
      </button>

      {showPreview && attachments.length > 0 && (
        <AttachmentPreviewMenu
          attachments={attachments}
          onRemove={onRemove}
          onClearAll={handleClearAll}
          onPreviewImage={handlePreviewImage}
          onMouseEnter={showMenu}
          onMouseLeave={hideMenu}
        />
      )}
    </div>
  );
}
