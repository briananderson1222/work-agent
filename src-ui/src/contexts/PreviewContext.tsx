import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react';

interface PreviewItem {
  url: string;
  mediaType: string;
  name?: string;
}

interface PreviewContextType {
  openPreview: (item: PreviewItem, items?: PreviewItem[]) => void;
  closePreview: () => void;
}

const PreviewContext = createContext<PreviewContextType | undefined>(undefined);

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<PreviewItem | null>(null);
  const [items, setItems] = useState<PreviewItem[]>([]);

  const openPreview = useCallback(
    (item: PreviewItem, allItems?: PreviewItem[]) => {
      setCurrent(item);
      setItems(allItems || [item]);
    },
    [],
  );

  const closePreview = useCallback(() => {
    setCurrent(null);
    setItems([]);
  }, []);

  const currentIdx = current
    ? items.findIndex((i) => i.url === current.url)
    : -1;
  const canPrev = currentIdx > 0;
  const canNext = currentIdx < items.length - 1;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') closePreview();
    else if (e.key === 'ArrowLeft' && canPrev)
      setCurrent(items[currentIdx - 1]);
    else if (e.key === 'ArrowRight' && canNext)
      setCurrent(items[currentIdx + 1]);
  };

  const canPreview = (mediaType?: string) => mediaType?.startsWith('image/');

  return (
    <PreviewContext.Provider value={{ openPreview, closePreview }}>
      {children}
      {current && canPreview(current.mediaType) && (
        <div
          className="image-preview-modal"
          onClick={closePreview}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="dialog"
          aria-label="Preview"
          ref={(el) => el?.focus()}
        >
          <button
            className="image-preview-modal__close"
            onClick={closePreview}
            aria-label="Close"
          >
            ×
          </button>
          {canPrev && (
            <button
              className="image-preview-modal__nav image-preview-modal__nav--prev"
              onClick={(e) => {
                e.stopPropagation();
                setCurrent(items[currentIdx - 1]);
              }}
            >
              ‹
            </button>
          )}
          <img
            src={current.url}
            alt={current.name || 'Preview'}
            className="image-preview-modal__image"
            onClick={(e) => e.stopPropagation()}
          />
          {canNext && (
            <button
              className="image-preview-modal__nav image-preview-modal__nav--next"
              onClick={(e) => {
                e.stopPropagation();
                setCurrent(items[currentIdx + 1]);
              }}
            >
              ›
            </button>
          )}
        </div>
      )}
    </PreviewContext.Provider>
  );
}

export function usePreview() {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error('usePreview must be used within PreviewProvider');
  return ctx;
}
