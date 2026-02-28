import { useEffect, useRef } from 'react';
import type { FileAttachment } from '../types';

interface ImagePreviewModalProps {
  previewImage: string;
  attachments: FileAttachment[];
  onClose: () => void;
  onNavigate: (preview: string) => void;
}

export function ImagePreviewModal({
  previewImage,
  attachments,
  onClose,
  onNavigate,
}: ImagePreviewModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  const currentIdx = attachments.findIndex((a) => a.preview === previewImage);
  const hasPrev = currentIdx > 0;
  const hasNext =
    currentIdx < attachments.length - 1 && attachments[currentIdx + 1]?.preview;

  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowLeft' && hasPrev) {
      e.preventDefault();
      onNavigate(attachments[currentIdx - 1].preview!);
    } else if (e.key === 'ArrowRight' && hasNext) {
      e.preventDefault();
      onNavigate(attachments[currentIdx + 1].preview!);
    }
  };

  return (
    <div
      ref={modalRef}
      className="image-preview-modal"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="dialog"
      aria-label="Image preview"
    >
      {hasPrev && (
        <button
          className="image-preview-modal__nav image-preview-modal__nav--prev"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(attachments[currentIdx - 1].preview!);
          }}
          title="Previous (←)"
        >
          ‹
        </button>
      )}
      <img
        src={previewImage}
        alt="Preview"
        className="image-preview-modal__image"
        onClick={(e) => e.stopPropagation()}
      />
      {hasNext && (
        <button
          className="image-preview-modal__nav image-preview-modal__nav--next"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(attachments[currentIdx + 1].preview!);
          }}
          title="Next (→)"
        >
          ›
        </button>
      )}
    </div>
  );
}
