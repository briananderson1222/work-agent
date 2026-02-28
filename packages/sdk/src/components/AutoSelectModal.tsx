import type React from 'react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import './AutoSelectModal.css';

export interface AutoSelectItem<T = any> {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  metadata?: T;
  badge?: string;
  timestamp?: string;
  isActive?: boolean;
}

interface AutoSelectModalProps<T = any> {
  isOpen: boolean;
  title: string;
  placeholder?: string;
  items: AutoSelectItem<T>[];
  loading?: boolean;
  emptyMessage?: string;
  onSelect: (item: AutoSelectItem<T>) => void;
  onClose: () => void;
  renderIcon?: (item: AutoSelectItem<T>) => ReactNode;
  renderMetadata?: (item: AutoSelectItem<T>) => ReactNode;
  showCancel?: boolean;
}

export function AutoSelectModal<T = any>({
  isOpen,
  title,
  placeholder = 'Search...',
  items,
  loading = false,
  emptyMessage = 'No items found',
  onSelect,
  onClose,
  renderIcon,
  renderMetadata,
  showCancel = false,
}: AutoSelectModalProps<T>) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredItems = items.filter((item) => {
    const searchLower = search.toLowerCase();
    return (
      item.title.toLowerCase().includes(searchLower) ||
      item.subtitle?.toLowerCase().includes(searchLower) ||
      item.description?.toLowerCase().includes(searchLower)
    );
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
      e.preventDefault();
      onSelect(filteredItems[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="auto-select-modal-overlay" onClick={onClose}>
      <div className="auto-select-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auto-select-modal__header">
          <h3 className="auto-select-modal__title">{title}</h3>
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="auto-select-modal__search"
          />
        </div>

        <div className="auto-select-modal__content">
          {loading ? (
            <div className="auto-select-modal__empty">Loading...</div>
          ) : filteredItems.length === 0 ? (
            <div className="auto-select-modal__empty">{emptyMessage}</div>
          ) : (
            filteredItems.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`auto-select-modal__item ${idx === selectedIndex ? 'auto-select-modal__item--selected' : ''}`}
              >
                {renderIcon && (
                  <div className="auto-select-modal__icon">
                    {renderIcon(item)}
                  </div>
                )}

                <div className="auto-select-modal__item-content">
                  <div className="auto-select-modal__item-header">
                    <div className="auto-select-modal__item-title">
                      {item.isActive && (
                        <span className="auto-select-modal__active-indicator">
                          ●
                        </span>
                      )}
                      {item.title}
                      {item.badge && (
                        <span className="auto-select-modal__badge">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {item.timestamp && (
                      <div className="auto-select-modal__timestamp">
                        {item.timestamp}
                      </div>
                    )}
                  </div>

                  {item.subtitle && (
                    <div className="auto-select-modal__subtitle">
                      {item.subtitle}
                    </div>
                  )}
                  {item.description && (
                    <div className="auto-select-modal__description">
                      {item.description}
                    </div>
                  )}
                  {renderMetadata?.(item)}
                </div>
              </button>
            ))
          )}
        </div>

        {showCancel && (
          <div className="auto-select-modal__footer">
            <button onClick={onClose} className="auto-select-modal__cancel">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
