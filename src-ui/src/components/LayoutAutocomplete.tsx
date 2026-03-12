import { useMemo } from 'react';
import { getLayoutIcon } from '../utils/layout';
import { AutocompleteSelector } from './AutocompleteSelector';
import { LayoutIcon } from './LayoutIcon';

interface LayoutAutocompleteProps {
  query: string;
  layouts: any[];
  currentLayout?: string;
  onSelect: (layout: any) => void;
  onClose: () => void;
}

export function LayoutAutocomplete({
  query,
  layouts,
  currentLayout,
  onSelect,
  onClose,
}: LayoutAutocompleteProps) {
  const items = useMemo(() => {
    const searchTerm = (query || '').toLowerCase();
    const filtered = (layouts || []).filter(
      (w) =>
        w.name.toLowerCase().includes(searchTerm) ||
        w.slug.toLowerCase().includes(searchTerm) ||
        w.description?.toLowerCase().includes(searchTerm),
    );

    const mapped = filtered.map((layout) => {
      const isActive = currentLayout === layout.slug;
      const icon = getLayoutIcon(layout);

      return {
        id: layout.slug,
        title: layout.name,
        description: layout.description,
        metadata: layout,
        isActive,
        icon: icon.display,
        isCustomIcon: icon.isCustomIcon,
      };
    });

    return mapped.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return 0;
    });
  }, [query, layouts, currentLayout]);

  return (
    <AutocompleteSelector
      items={items}
      onSelect={(item) => onSelect(item.metadata)}
      onClose={onClose}
      emptyMessage="No layouts found"
      renderIcon={(item) => <LayoutIcon layout={item.metadata} size={32} />}
    />
  );
}
