import { useMemo } from 'react';
import { AutocompleteSelector, AutocompleteItem } from './AutocompleteSelector';

export interface Model {
  id: string;
  name: string;
  originalId: string;
}

interface ModelSelectorProps {
  query: string;
  models: Model[];
  currentModel?: string;
  onSelect: (model: Model) => void;
  onClose: () => void;
}

export function ModelSelector({ query, models, currentModel, onSelect, onClose }: ModelSelectorProps) {
  // Filter and map models to AutocompleteItem format
  const items = useMemo(() => {
    const searchTerm = (query || '').toLowerCase();
    const filtered = models.filter(m => 
      m.name.toLowerCase().includes(searchTerm) || 
      m.id.toLowerCase().includes(searchTerm) ||
      m.originalId.toLowerCase().includes(searchTerm)
    ).slice(0, 10); // Limit to 10 results

    const normalizeId = (id: any) => {
      if (typeof id !== 'string') return '';
      return id.replace(/^us\./, '');
    };
    const currentModelStr = typeof currentModel === 'string' ? currentModel : '';

    const mapped = filtered.map(model => {
      const isActive = normalizeId(currentModelStr) === normalizeId(model.id) || 
                       currentModelStr === model.id ||
                       currentModelStr === model.originalId;
      
      return {
        id: model.id,
        title: `${model.name}${isActive ? ' (active)' : ''}`,
        description: model.id !== model.originalId ? `ID: ${model.id}` : undefined,
        metadata: model,
        isActive
      };
    });

    // Sort active model first
    return mapped.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return 0;
    });
  }, [query, models, currentModel]);

  return (
    <AutocompleteSelector
      items={items}
      onSelect={(item) => onSelect(item.metadata)}
      onClose={onClose}
      emptyMessage="No models found"
    />
  );
}
