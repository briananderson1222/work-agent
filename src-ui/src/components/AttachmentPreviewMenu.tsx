import type { FileAttachment } from '../types';

interface AttachmentPreviewMenuProps {
  attachments: FileAttachment[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onPreviewImage: (preview: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function AttachmentPreviewMenu({
  attachments,
  onRemove,
  onClearAll,
  onPreviewImage,
  onMouseEnter,
  onMouseLeave,
}: AttachmentPreviewMenuProps) {
  return (
    <div
      role="dialog"
      className="attachment-menu"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="attachment-menu__header">
        <div className="attachment-menu__count">
          {attachments.length} Attachment{attachments.length !== 1 ? 's' : ''}
        </div>
        <button
          className="attachment-menu__clear-btn"
          onClick={(e) => {
            e.stopPropagation();
            onClearAll();
          }}
        >
          Clear All
        </button>
      </div>
      <div className="attachment-menu__list">
        {attachments.map((att) => (
          <div key={att.id} className="attachment-menu__item" data-attachment>
            {att.preview ? (
              <img
                src={att.preview}
                alt={att.name}
                className="attachment-menu__thumbnail"
                onClick={() => onPreviewImage(att.preview!)}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPreviewImage(att.preview!);
                  }
                }}
                title="Click to preview"
              />
            ) : (
              <div className="attachment-menu__file-icon">📄</div>
            )}
            <div className="attachment-menu__info">
              <div className="attachment-menu__name">{att.name}</div>
              <div className="attachment-menu__size">
                {(att.size / 1024).toFixed(1)} KB
              </div>
            </div>
            <button
              className="attachment-menu__remove-btn"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(att.id);
              }}
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
