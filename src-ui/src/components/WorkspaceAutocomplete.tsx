import { useMemo } from 'react';
import { getWorkspaceIcon } from '../utils/workspace';
import { AutocompleteSelector } from './AutocompleteSelector';
import { WorkspaceIcon } from './WorkspaceIcon';

interface WorkspaceAutocompleteProps {
  query: string;
  workspaces: any[];
  currentWorkspace?: string;
  onSelect: (workspace: any) => void;
  onClose: () => void;
}

export function WorkspaceAutocomplete({
  query,
  workspaces,
  currentWorkspace,
  onSelect,
  onClose,
}: WorkspaceAutocompleteProps) {
  const items = useMemo(() => {
    const searchTerm = (query || '').toLowerCase();
    const filtered = (workspaces || []).filter(
      (w) =>
        w.name.toLowerCase().includes(searchTerm) ||
        w.slug.toLowerCase().includes(searchTerm) ||
        w.description?.toLowerCase().includes(searchTerm),
    );

    const mapped = filtered.map((workspace) => {
      const isActive = currentWorkspace === workspace.slug;
      const icon = getWorkspaceIcon(workspace);

      return {
        id: workspace.slug,
        title: workspace.name,
        description: workspace.description,
        metadata: workspace,
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
  }, [query, workspaces, currentWorkspace]);

  return (
    <AutocompleteSelector
      items={items}
      onSelect={(item) => onSelect(item.metadata)}
      onClose={onClose}
      emptyMessage="No workspaces found"
      renderIcon={(item) => (
        <WorkspaceIcon workspace={item.metadata} size={32} />
      )}
    />
  );
}
