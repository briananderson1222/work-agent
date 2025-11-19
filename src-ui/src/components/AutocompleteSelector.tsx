import { useState, useEffect, useRef } from 'react';

export interface AutocompleteItem {
  id: string;
  title: string;
  description?: string;
  metadata?: any; // For passing additional data
}

interface AutocompleteSelectorProps {
  items: AutocompleteItem[];
  onSelect: (item: AutocompleteItem) => void;
  onClose: () => void;
  emptyMessage?: string;
}

export function AutocompleteSelector({ items, onSelect, onClose, emptyMessage = 'No results found' }: AutocompleteSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(0);
  const itemsRef = useRef<AutocompleteItem[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Update refs
  selectedIndexRef.current = selectedIndex;
  itemsRef.current = items;

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => Math.min(prev + 1, itemsRef.current.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const item = itemsRef.current[selectedIndexRef.current];
        if (item) {
          onSelect(item);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onSelect, onClose]);

  if (items.length === 0) {
    return (
      <div 
        ref={containerRef}
        style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '4px',
        marginBottom: '4px',
        padding: '12px',
        zIndex: 1000,
        boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.1)',
        color: 'var(--text-muted)',
        fontSize: '14px',
        textAlign: 'center'
      }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      style={{
      position: 'absolute',
      bottom: '100%',
      left: 0,
      right: 0,
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-primary)',
      borderRadius: '4px',
      marginBottom: '4px',
      maxHeight: 'min(300px, 40vh)',
      overflowY: 'auto',
      zIndex: 1000,
      boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.1)',
    }}>
      {items.map((item, idx) => (
        <div
          key={item.id}
          onClick={() => onSelect(item)}
          onMouseEnter={() => setSelectedIndex(idx)}
          style={{
            padding: '10px 12px',
            cursor: 'pointer',
            background: idx === selectedIndex ? 'var(--bg-hover)' : 'transparent',
            borderBottom: idx < items.length - 1 ? '1px solid var(--border-primary)' : 'none',
            borderLeft: idx === selectedIndex ? '3px solid var(--accent-primary, #0066cc)' : '3px solid transparent',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: item.description ? '4px' : '0' }}>
            {item.title}
          </div>
          {item.description && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {item.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
