import { useState, useEffect, useRef } from 'react';
import { useModels } from '../contexts/ModelsContext';
import { useApiBase } from '../contexts/ConfigContext';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  placeholder?: string;
}

export function ModelSelector({ value, onChange, placeholder = 'Select a model...' }: ModelSelectorProps) {
  const { apiBase } = useApiBase();
  const models = useModels(apiBase);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedModel = models.find(m => m.id === value);

  const filteredModels = models.filter(m =>
    m.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.id?.toLowerCase().includes(search.toLowerCase())
  );

  // Sort to show active model first
  const sortedModels = [...filteredModels].sort((a, b) => {
    if (a.id === value) return -1;
    if (b.id === value) return 1;
    return 0;
  });

  // Reset selected index when filtered models change
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, sortedModels.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (sortedModels[selectedIndex]) {
          onChange(sortedModels[selectedIndex].id);
          setIsOpen(false);
          setSearch('');
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearch('');
        break;
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={isOpen ? search : (selectedModel ? `${selectedModel.name} (${selectedModel.id})` : value || '')}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setIsOpen(true);
          setSearch('');
          setSelectedIndex(0);
        }}
        placeholder={placeholder}
        style={{ cursor: 'pointer' }}
      />
      {isOpen && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 999,
            }}
            onClick={() => {
              setIsOpen(false);
              setSearch('');
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              maxHeight: '300px',
              overflowY: 'auto',
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              zIndex: 1000,
            }}
          >
            {sortedModels.length === 0 ? (
              <div style={{ padding: '12px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                No models found
              </div>
            ) : (
              sortedModels.map((model, index) => (
                <div
                  key={model.id}
                  onClick={() => {
                    onChange(model.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    background: index === selectedIndex ? 'var(--color-primary-alpha)' : 'transparent',
                    border: index === selectedIndex ? '2px solid var(--color-primary)' : '2px solid transparent',
                    borderBottom: '1px solid var(--color-border)',
                    marginBottom: index === selectedIndex ? '-1px' : '0',
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                    {model.name}
                    {value === model.id && (
                      <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--color-primary)' }}>
                        (active)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    {model.id}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
