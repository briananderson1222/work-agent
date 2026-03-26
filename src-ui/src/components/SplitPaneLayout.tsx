import { LoadingState } from '@stallion-ai/sdk';
import React, { useEffect, useState } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import './SplitPaneLayout.css';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

interface SplitPaneItem {
  id: string;
  name: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

interface SplitPaneLayoutProps {
  // Left panel
  items: SplitPaneItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeselect?: () => void;
  onSearch: (query: string) => void;
  searchPlaceholder?: string;
  onAdd?: () => void;
  addLabel?: string;
  /** Extra actions rendered next to the Add button in the sidebar footer */
  sidebarActions?: React.ReactNode;
  /** Show loading spinner in list panel instead of items */
  loading?: boolean;
  // Right panel
  children: React.ReactNode;
  emptyIcon?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Custom empty state content — replaces the default icon/title/desc */
  emptyContent?: React.ReactNode;
  // Header
  label: string;
  /** Map of breadcrumb segment text → click handler. Segments not in this map are plain text. */
  breadcrumbLinks?: Record<string, () => void>;
  title: string;
  subtitle?: string;
}

export function SplitPaneLayout({
  items,
  selectedId,
  onSelect,
  onDeselect,
  onSearch,
  searchPlaceholder = 'Search...',
  onAdd,
  addLabel = '+ New',
  sidebarActions,
  loading,
  children,
  emptyIcon = '⬡',
  emptyTitle = 'Nothing selected',
  emptyDescription = 'Select an item from the list',
  emptyContent,
  label,
  breadcrumbLinks,
  title,
  subtitle,
}: SplitPaneLayoutProps) {
  const isMobile = useIsMobile();
  const { navigate } = useNavigation();
  const breadcrumb = label.split(/\s*\/\s*/).map((seg, i, arr) => {
    // Non-terminal segments auto-link to /<segment> unless overridden
    const isLast = i === arr.length - 1;
    const handler =
      breadcrumbLinks?.[seg.toLowerCase()] ??
      (!isLast ? () => navigate(`/${seg.toLowerCase()}`) : undefined);
    return (
      <React.Fragment key={i}>
        {handler ? (
          <span className="split-pane__label-link" onClick={handler}>
            {seg}
          </span>
        ) : (
          <span>{seg}</span>
        )}
        {!isLast && <span className="split-pane__label-sep"> / </span>}
      </React.Fragment>
    );
  });
  return (
    <div className="split-pane">
      <div className={`split-pane__left${!isMobile || !selectedId ? ' split-pane__left--visible' : ''}`}>
        <div className="split-pane__header">
          <div className="split-pane__label">{breadcrumb}</div>
          <h2
            className={`split-pane__title ${selectedId && onDeselect ? 'split-pane__title--clickable' : ''}`}
            onClick={selectedId && onDeselect ? onDeselect : undefined}
          >
            {title}
          </h2>
          {subtitle && <p className="split-pane__subtitle">{subtitle}</p>}
          <input
            className="split-pane__search"
            type="text"
            placeholder={searchPlaceholder}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        <div className="split-pane__list">
          {loading ? (
            <LoadingState message="Loading..." />
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`split-pane__item${selectedId === item.id ? ' split-pane__item--selected' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                {item.icon && (
                  <div className="split-pane__item-icon">{item.icon}</div>
                )}
                <div className="split-pane__item-text">
                  <div className="split-pane__item-name">{item.name}</div>
                  {item.subtitle && (
                    <div className="split-pane__item-subtitle">
                      {item.subtitle}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {(onAdd || sidebarActions) && (
          <div className="split-pane__add">
            {sidebarActions}
            {onAdd && (
              <button className="split-pane__add-btn" onClick={onAdd}>
                {addLabel}
              </button>
            )}
          </div>
        )}
      </div>

      <div className={`split-pane__right${!isMobile || selectedId ? ' split-pane__right--visible' : ''}`}>
        {isMobile && selectedId && (
          <button className="split-pane__back" onClick={() => onDeselect?.()}>
            ← Back to list
          </button>
        )}
        {selectedId
          ? children
          : emptyContent || (
              <div className="split-pane__empty">
                <div className="split-pane__empty-icon">{emptyIcon}</div>
                <p className="split-pane__empty-title">{emptyTitle}</p>
                <p className="split-pane__empty-desc">{emptyDescription}</p>
              </div>
            )}
      </div>
    </div>
  );
}
